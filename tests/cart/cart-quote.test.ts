import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { addImage } from '../../src/commerce/catalog/images'
import { adjustStock, getStock } from '../../src/commerce/catalog/inventory'
import { archiveProduct, createProduct, updateProduct } from '../../src/commerce/catalog/products'
import { clearStoreCache, type StoreContext } from '../../src/commerce/catalog/store'
import { createProductSchema, stockAdjustmentSchema } from '../../src/commerce/catalog/validation'
import { archiveVariant, updateVariant } from '../../src/commerce/catalog/variants'
import { CART_MAX_LINES, CART_MAX_QUANTITY, type CartQuote } from '../../src/commerce/cart/cart'
import { quoteCart } from '../../src/commerce/cart/quote'
import type { ApiDeps } from '../../src/server/api/deps'
import { buildApi } from '../../src/server/api/routes'
import { inventory } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/types'
import { getServerEnv } from '../../src/server/env'
import { memoryStore } from '../../src/server/storage/object-store'
import { createTestDb, newStore, uniq } from '../helpers/db'

let db: Db
let close: () => Promise<void>
let store: StoreContext
let other: StoreContext
const api = buildApi()

beforeAll(async () => {
  ;({ db, close } = await createTestDb())
  store = await newStore(db)
  other = await newStore(db)
}, 60_000)
afterAll(() => close())
beforeEach(() => clearStoreCache())

const sku = () => uniq('SKU').toUpperCase()
const make = (s: StoreContext, o: Record<string, unknown> = {}, variants: Record<string, unknown>[] = [{}]) =>
  createProduct(db, s, createProductSchema.parse({ name: `P ${uniq()}`, status: 'active', ...o, variants: variants.map((v) => ({ sku: sku(), priceMinor: 179900, initialStock: 5, ...v })) }), 'test')

const deps = (o: Partial<ApiDeps> = {}): ApiDeps => ({
  db: () => db,
  env: () => getServerEnv({ APP_ENV: 'development' }),
  storeCode: store.code,
  storeName: 'Test',
  objectStore: () => memoryStore(),
  fetch: () => Promise.reject(new Error('offline')),
  ...o,
})
const post = (body: unknown, d = deps(), headers: Record<string, string> = {}) =>
  api.handle(new Request('http://localhost:3000/api/cart/quote', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), d)
const quote = async (items: { sku: string; quantity: number }[], d = deps()) => {
  const res = await post({ items }, d)
  expect(res.status).toBe(200)
  return ((await res.json()) as { data: CartQuote }).data
}

describe('pricing a cart', () => {
  it('prices a valid product from the database, in integer minor units', async () => {
    const p = await make(store, { slug: uniq('rawah') }, [{ title: '50ml Eau de Parfum', priceMinor: 179900 }])
    await addImage(db, store.id, p.id, { source: 'static', storageKey: '/products/rawah.webp', altText: 'Rawah bottle' })
    const q = await quote([{ sku: p.variants[0].sku, quantity: 2 }])
    expect(q).toMatchObject({
      currency: 'INR',
      subtotalMinor: 359800,
      itemCount: 2,
      canCheckout: true,
      lines: [
        {
          sku: p.variants[0].sku,
          quantity: 2,
          status: 'ok',
          maxQuantity: 5,
          unitPriceMinor: 179900,
          compareAtMinor: null,
          lineTotalMinor: 359800,
          product: { slug: p.slug, name: p.name, variantTitle: '50ml Eau de Parfum', image: { url: '/products/rawah.webp', alt: 'Rawah bottle' } },
        },
      ],
    })
    expect(Number.isInteger(q.subtotalMinor)).toBe(true)
  })

  it('prices the chosen variant (size), not the first one', async () => {
    const p = await make(store, {}, [{ title: '12ml', priceMinor: 49900 }, { title: '50ml', priceMinor: 179900 }])
    const q = await quote([{ sku: p.variants[1].sku, quantity: 1 }])
    expect(q.lines[0]).toMatchObject({ status: 'ok', unitPriceMinor: 179900, product: { variantTitle: '50ml' } })
    const both = await quote([
      { sku: p.variants[0].sku, quantity: 1 },
      { sku: p.variants[1].sku, quantity: 1 },
    ])
    expect(both.subtotalMinor).toBe(49900 + 179900)
  })

  it('adds the same variant twice into one line', async () => {
    const p = await make(store)
    const q = await quote([
      { sku: p.variants[0].sku, quantity: 1 },
      { sku: p.variants[0].sku, quantity: 2 },
    ])
    expect(q.lines).toHaveLength(1)
    expect(q.lines[0]).toMatchObject({ quantity: 3, lineTotalMinor: 3 * 179900 })
  })

  it('uses the sale price and shows the regular price beside it', async () => {
    const p = await make(store, {}, [{ priceMinor: 179900, salePriceMinor: 149950 }])
    const q = await quote([{ sku: p.variants[0].sku, quantity: 3 }])
    expect(q.lines[0]).toMatchObject({ unitPriceMinor: 149950, compareAtMinor: 179900, lineTotalMinor: 449850 })
    expect(q.subtotalMinor).toBe(449850) // 3 × ₹1,499.50, exact: no floating point
  })

  it('always uses the current price when it changes after adding to the cart', async () => {
    const p = await make(store, {}, [{ priceMinor: 179900 }])
    const item = [{ sku: p.variants[0].sku, quantity: 2 }]
    expect((await quote(item)).subtotalMinor).toBe(359800)
    await updateVariant(db, store.id, p.variants[0].id, { priceMinor: 199900 })
    expect((await quote(item)).lines[0]).toMatchObject({ unitPriceMinor: 199900, lineTotalMinor: 399800 })
    await updateVariant(db, store.id, p.variants[0].id, { salePriceMinor: 150000 })
    expect((await quote(item)).subtotalMinor).toBe(300000)
    await updateVariant(db, store.id, p.variants[0].id, { salePriceMinor: null })
    expect((await quote(item)).subtotalMinor).toBe(399800)
  })

  it('reflects quantity changes and removals (the browser sends the whole cart each time)', async () => {
    const a = await make(store)
    const b = await make(store, {}, [{ priceMinor: 50000 }])
    const up = await quote([
      { sku: a.variants[0].sku, quantity: 3 },
      { sku: b.variants[0].sku, quantity: 1 },
    ])
    expect(up.subtotalMinor).toBe(3 * 179900 + 50000)
    const down = await quote([
      { sku: a.variants[0].sku, quantity: 1 },
      { sku: b.variants[0].sku, quantity: 1 },
    ])
    expect(down.subtotalMinor).toBe(179900 + 50000)
    const removed = await quote([{ sku: b.variants[0].sku, quantity: 1 }])
    expect(removed.lines.map((l) => l.sku)).toEqual([b.variants[0].sku])
    const cleared = await quote([])
    expect(cleared).toMatchObject({ lines: [], subtotalMinor: 0, itemCount: 0, canCheckout: false })
  })

  it('returns no database ids and is never cached', async () => {
    const p = await make(store)
    const res = await post({ items: [{ sku: p.variants[0].sku, quantity: 1 }] })
    expect(res.headers.get('cache-control')).toBe('no-store')
    const text = await res.text()
    expect(text).not.toContain(p.id)
    expect(text).not.toContain(p.variants[0].id)
    expect(text).not.toContain(store.id)
    expect(text).not.toMatch(/availableQuantity|reservedQuantity|"available"|"reserved"/)
  })
})

describe('stock and availability', () => {
  it('marks a zero-stock item sold out and blocks checkout', async () => {
    const p = await make(store, {}, [{ initialStock: 0 }])
    const ok = await make(store)
    const q = await quote([
      { sku: p.variants[0].sku, quantity: 1 },
      { sku: ok.variants[0].sku, quantity: 1 },
    ])
    expect(q.lines[0]).toMatchObject({ status: 'sold_out', maxQuantity: 0, product: { name: p.name } })
    expect(q.lines[1].status).toBe('ok')
    expect(q.subtotalMinor).toBe(179900) // only what can be bought
    expect(q.canCheckout).toBe(false)
  })

  it('reports insufficient stock with how many can be bought, then accepts the corrected quantity', async () => {
    const p = await make(store, {}, [{ initialStock: 3 }])
    const q = await quote([{ sku: p.variants[0].sku, quantity: 5 }])
    expect(q.lines[0]).toMatchObject({ status: 'insufficient_stock', maxQuantity: 3, quantity: 5 })
    expect(q.canCheckout).toBe(false)
    const fixed = await quote([{ sku: p.variants[0].sku, quantity: 3 }])
    expect(fixed.lines[0].status).toBe('ok')
    expect(fixed.canCheckout).toBe(true)
  })

  it('rechecks stock on every quote, counting reserved units as gone', async () => {
    const p = await make(store, {}, [{ initialStock: 4 }])
    const item = [{ sku: p.variants[0].sku, quantity: 2 }]
    expect((await quote(item)).lines[0].status).toBe('ok')
    await adjustStock(db, store.id, p.variants[0].id, stockAdjustmentSchema.parse({ type: 'damage', quantityChange: -3, reason: 'broken' }), 'test')
    expect((await quote(item)).lines[0]).toMatchObject({ status: 'insufficient_stock', maxQuantity: 1 })
    await db.update(inventory).set({ reservedQuantity: 1 }).where(eq(inventory.variantId, p.variants[0].id))
    expect((await quote(item)).lines[0]).toMatchObject({ status: 'sold_out', maxQuantity: 0 })
  })

  it('reveals at most the per-item limit of stock', async () => {
    const p = await make(store, {}, [{ initialStock: 500 }])
    const q = await quote([{ sku: p.variants[0].sku, quantity: 1 }])
    expect(q.lines[0].maxQuantity).toBe(CART_MAX_QUANTITY)
  })

  it('never deducts or reserves stock, however often it is asked', async () => {
    const p = await make(store, {}, [{ initialStock: 5 }])
    const results = await Promise.all(Array.from({ length: 30 }, () => quote([{ sku: p.variants[0].sku, quantity: 5 }])))
    expect(new Set(results.map((r) => JSON.stringify({ ...r, checkedAt: '' }))).size).toBe(1) // rapid repeated requests: same answer
    expect(results[0].lines[0].status).toBe('ok')
    expect(await getStock(db, store.id, p.variants[0].id)).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 })
  })

  it('treats archived products as unavailable, with no details', async () => {
    const p = await make(store)
    await archiveProduct(db, store.id, p.id)
    const q = await quote([{ sku: p.variants[0].sku, quantity: 1 }])
    expect(q.lines[0]).toEqual({ sku: p.variants[0].sku, quantity: 1, status: 'unavailable', maxQuantity: 0, product: null, unitPriceMinor: null, compareAtMinor: null, lineTotalMinor: null })
    expect(q.canCheckout).toBe(false)
  })

  it('treats unpublished (draft) products as unavailable without revealing them', async () => {
    const p = await make(store, { status: 'draft', name: `Secret launch ${uniq()}` }, [{ priceMinor: 999900 }])
    const res = await post({ items: [{ sku: p.variants[0].sku, quantity: 1 }] })
    const text = await res.text()
    expect(JSON.parse(text).data.lines[0].status).toBe('unavailable')
    expect(text).not.toContain('Secret launch')
    expect(text).not.toContain('999900')
    // A product that goes back to draft disappears from carts too.
    const live = await make(store)
    await updateProduct(db, store.id, live.id, { status: 'draft' })
    expect((await quote([{ sku: live.variants[0].sku, quantity: 1 }])).lines[0].status).toBe('unavailable')
  })

  it('treats inactive and archived variants as unavailable', async () => {
    const p = await make(store, {}, [{}, {}])
    await updateVariant(db, store.id, p.variants[0].id, { status: 'inactive' })
    await archiveVariant(db, store.id, p.variants[1].id)
    const q = await quote(p.variants.map((v) => ({ sku: v.sku, quantity: 1 })))
    expect(q.lines.map((l) => l.status)).toEqual(['unavailable', 'unavailable'])
  })

  it('answers "unavailable" for an unknown product code', async () => {
    const q = await quote([{ sku: 'NO-SUCH-SKU', quantity: 1 }])
    expect(q.lines[0]).toMatchObject({ status: 'unavailable', product: null })
  })
})

describe('store isolation', () => {
  it("does not find another store's products", async () => {
    const theirs = await make(other, { name: `Other store ${uniq()}` })
    const res = await post({ items: [{ sku: theirs.variants[0].sku, quantity: 1 }] })
    const text = await res.text()
    expect(JSON.parse(text).data.lines[0].status).toBe('unavailable')
    expect(text).not.toContain(theirs.name)
  })

  it('uses this store when two stores share a SKU', async () => {
    const shared = sku()
    await make(other, {}, [{ sku: shared, priceMinor: 100 }])
    await make(store, {}, [{ sku: shared, priceMinor: 179900 }])
    expect((await quote([{ sku: shared, quantity: 1 }])).lines[0].unitPriceMinor).toBe(179900)
    // The same request served by the other store's deployment sees the other store's price.
    expect((await quote([{ sku: shared, quantity: 1 }], deps({ storeCode: other.code }))).lines[0].unitPriceMinor).toBe(100)
  })

  it('refuses a client-supplied store id', async () => {
    const p = await make(other)
    for (const body of [
      { items: [{ sku: p.variants[0].sku, quantity: 1 }], storeId: other.id },
      { items: [{ sku: p.variants[0].sku, quantity: 1, storeId: other.id }] },
      { items: [{ sku: p.variants[0].sku, quantity: 1 }], store: other.code },
    ]) {
      expect((await post(body)).status).toBe(422)
    }
  })

  it('isolates stores in the service as well', async () => {
    const theirs = await make(other)
    const q = await quoteCart(db, { code: store.code, currency: 'INR' }, [{ sku: theirs.variants[0].sku, quantity: 1 }])
    expect(q.lines[0].status).toBe('unavailable')
  })
})

describe('input validation', () => {
  it('refuses prices, totals and other fields sent by the browser', async () => {
    const p = await make(store, {}, [{ priceMinor: 179900 }])
    const s = p.variants[0].sku
    for (const body of [
      { items: [{ sku: s, quantity: 1, priceMinor: 1 }] },
      { items: [{ sku: s, quantity: 1, unitPriceMinor: 1 }] },
      { items: [{ sku: s, quantity: 1 }], subtotalMinor: 1 },
      { items: [{ sku: s, quantity: 1 }], total: 1 },
    ]) {
      const res = await post(body)
      expect(res.status).toBe(422)
      expect((await res.json()).error.code).toBe('validation_failed')
    }
    expect((await quote([{ sku: s, quantity: 1 }])).subtotalMinor).toBe(179900)
  })

  it('refuses invalid quantities', async () => {
    const s = (await make(store)).variants[0].sku
    for (const quantity of [0, -1, 1.5, CART_MAX_QUANTITY + 1, '2', null, 1e9]) {
      expect((await post({ items: [{ sku: s, quantity }] })).status).toBe(422)
    }
  })

  it('refuses malformed product codes and bodies', async () => {
    for (const body of [{ items: [{ sku: '', quantity: 1 }] }, { items: [{ sku: '../etc', quantity: 1 }] }, { items: [{ sku: "x' or 1=1", quantity: 1 }] }, { items: [{ quantity: 1 }] }, { items: 'all' }, {}, []]) {
      expect((await post(body)).status).toBe(422)
    }
    expect((await post('{not json')).status).toBe(400)
    expect((await post({ items: [] }, deps(), { 'content-type': 'text/plain' })).status).toBe(415)
  })

  it('limits the number of lines and the body size', async () => {
    const many = Array.from({ length: CART_MAX_LINES + 1 }, (_, i) => ({ sku: `SKU-${i}`, quantity: 1 }))
    expect((await post({ items: many })).status).toBe(422)
    expect((await post({ items: [], pad: 'x'.repeat(10_000) })).status).toBe(413)
  })

  it('only accepts POST', async () => {
    const res = await api.handle(new Request('http://localhost:3000/api/cart/quote'), deps())
    expect(res.status).toBe(405)
  })
})

describe('database failures', () => {
  it('answers 503 with a friendly message and no internal details', async () => {
    const broken = deps({ db: () => ({ select: () => { throw new Error('connect ECONNREFUSED 10.0.0.1 password=hunter2') }, execute: () => Promise.reject(new Error('down')), batch: () => Promise.reject(new Error('down')) }) as never })
    clearStoreCache()
    const res = await post({ items: [{ sku: 'ABZ-RAWAH', quantity: 1 }] }, broken)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, error: { code: 'service_unavailable' } })
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|hunter2|10\.0\.0\.1|stack/)
  })
})
