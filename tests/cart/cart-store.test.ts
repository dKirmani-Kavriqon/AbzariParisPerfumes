import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createProduct } from '../../src/commerce/catalog/products'
import { clearStoreCache, type StoreContext } from '../../src/commerce/catalog/store'
import { createProductSchema } from '../../src/commerce/catalog/validation'
import { updateVariant } from '../../src/commerce/catalog/variants'
import {
  addItem,
  cartStorageKey,
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  CART_TTL_MS,
  parseStoredCart,
  removeItem,
  serializeCart,
  setQuantity,
} from '../../src/commerce/cart/cart'
import type { ApiDeps } from '../../src/server/api/deps'
import { buildApi } from '../../src/server/api/routes'
import type { Db } from '../../src/server/db/types'
import { getServerEnv } from '../../src/server/env'
import { memoryStore } from '../../src/server/storage/object-store'
import { createCartStore, quoteIsCurrent } from '../../src/state/cart'
import { createTestDb, newStore, uniq } from '../helpers/db'

let db: Db
let close: () => Promise<void>
let store: StoreContext
const api = buildApi()

beforeAll(async () => {
  ;({ db, close } = await createTestDb())
  store = await newStore(db)
}, 60_000)
afterAll(() => close())
beforeEach(() => clearStoreCache())

const deps = (): ApiDeps => ({
  db: () => db,
  env: () => getServerEnv({ APP_ENV: 'development' }),
  storeCode: store.code,
  storeName: 'Test',
  objectStore: () => memoryStore(),
  fetch: () => Promise.reject(new Error('offline')),
})
const product = async (v: Record<string, unknown> = {}) =>
  (await createProduct(db, store, createProductSchema.parse({ name: `P ${uniq()}`, status: 'active', variants: [{ sku: uniq('SKU').toUpperCase(), priceMinor: 179900, initialStock: 5, ...v }] }), 'test')).variants[0]

/** localStorage stand-in. */
function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m }
}

/** A bag wired to the real API (and so the real database), with a controllable clock and network. */
function bag(o: { storage?: ReturnType<typeof memoryStorage>; now?: () => number; down?: boolean; delay?: (body: string) => number } = {}) {
  const storage = o.storage ?? memoryStorage()
  const calls: string[] = []
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push(String(init?.body))
    if (o.down) throw new TypeError('Failed to fetch')
    const wait = o.delay?.(String(init?.body)) ?? 0
    if (wait) await new Promise((r) => setTimeout(r, wait))
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return api.handle(new Request(`http://localhost:3000${url}`, { method: init?.method, headers: init?.headers, body: init?.body }), deps())
  }) as typeof fetch
  const s = createCartStore({ storeCode: store.code, storage: () => storage, fetch: fetchFn, now: o.now ?? (() => Date.now()), debounceMs: 20 })
  return { s, storage, calls }
}
const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms))

describe('cart operations (pure)', () => {
  it('adds, merges the same item, caps quantities and lines', () => {
    let items = addItem([], 'ABZ-1')
    items = addItem(items, 'ABZ-1', 2)
    expect(items).toEqual([{ sku: 'ABZ-1', quantity: 3 }])
    expect(addItem(items, 'ABZ-1', 50)).toEqual([{ sku: 'ABZ-1', quantity: CART_MAX_QUANTITY }])
    expect(addItem(items, 'bad sku!')).toBe(items)
    expect(addItem(items, 'ABZ-2', 0)).toBe(items)
    let full: { sku: string; quantity: number }[] = []
    for (let i = 0; i < CART_MAX_LINES + 3; i++) full = addItem(full, `S-${i}`)
    expect(full).toHaveLength(CART_MAX_LINES)
  })

  it('increases, decreases (never below 1), removes and clears', () => {
    const items = [{ sku: 'A', quantity: 2 }, { sku: 'B', quantity: 1 }]
    expect(setQuantity(items, 'A', 3)[0].quantity).toBe(3)
    expect(setQuantity(items, 'A', 1)[0].quantity).toBe(1)
    expect(setQuantity(items, 'A', 0)[0].quantity).toBe(1)
    expect(setQuantity(items, 'A', 99)[0].quantity).toBe(CART_MAX_QUANTITY)
    expect(setQuantity(items, 'A', Number.NaN)).toBe(items)
    expect(removeItem(items, 'A')).toEqual([{ sku: 'B', quantity: 1 }])
  })
})

describe('the bag in the browser', () => {
  it('adds a product, gets server prices, and survives a page refresh', async () => {
    const v = await product({ priceMinor: 179900 })
    const first = bag()
    expect(await first.s.getState().add(v.sku, 2)).toBe('added')
    expect(first.s.getState().quote).toMatchObject({ subtotalMinor: 359800, canCheckout: true })
    expect(first.s.getState().open).toBe(true)

    // What is saved: codes and quantities, no totals, no stock.
    const saved = JSON.parse(first.storage.getItem(cartStorageKey(store.code))!)
    expect(saved).toMatchObject({ v: 2, store: store.code, items: [{ sku: v.sku, quantity: 2 }] })
    expect(JSON.stringify(saved)).not.toMatch(/subtotal|lineTotal|available|maxQuantity|status/)

    // "Refresh": a new bag on the same storage.
    const second = bag({ storage: first.storage })
    second.s.getState().hydrate()
    expect(second.s.getState().items).toEqual([{ sku: v.sku, quantity: 2 }])
    await settle()
    expect(second.s.getState().quote?.subtotalMinor).toBe(359800) // rechecked on load
    expect(second.calls).toHaveLength(1)
  })

  it('forgets a bag after 30 days without changes', async () => {
    const storage = memoryStorage()
    const t0 = Date.UTC(2026, 10, 1)
    storage.setItem(cartStorageKey(store.code), serializeCart(store.code, [{ sku: 'ABZ-1', quantity: 1 }], t0))
    expect(parseStoredCart(storage.getItem(cartStorageKey(store.code)), store.code, t0 + CART_TTL_MS - 1000)).toHaveLength(1)
    const late = bag({ storage, now: () => t0 + CART_TTL_MS + 1000 })
    late.s.getState().hydrate()
    expect(late.s.getState().items).toEqual([])
    expect(storage.getItem(cartStorageKey(store.code))).toBeNull()
    expect(late.calls).toHaveLength(0)
  })

  it("ignores another store's bag, old formats and hand-edited contents", () => {
    const now = Date.now()
    expect(parseStoredCart(serializeCart('other-store', [{ sku: 'A', quantity: 1 }], now), store.code, now)).toEqual([])
    expect(parseStoredCart(JSON.stringify({ state: { lines: [{ slug: 'rawah', qty: 1 }] } }), store.code, now)).toEqual([])
    expect(parseStoredCart('{nope', store.code, now)).toEqual([])
    const edited = JSON.stringify({
      v: 2,
      store: store.code,
      updatedAt: now,
      items: [{ sku: 'OK-1', quantity: 2 }, { sku: 'OK-1', quantity: 1 }, { sku: 'BIG', quantity: 999 }, { sku: '<script>', quantity: 1 }, { sku: 'P', quantity: 1, priceMinor: 1 }],
    })
    expect(parseStoredCart(edited, store.code, now)).toEqual([{ sku: 'OK-1', quantity: 3 }])
    const storage = memoryStorage()
    storage.setItem('abzari-cart', '{"state":{"lines":[]}}')
    bag({ storage }).s.getState().hydrate()
    expect(storage.getItem('abzari-cart')).toBeNull()
  })

  it('adds once however fast the button is clicked', async () => {
    const v = await product()
    const { s, calls } = bag({ delay: () => 30 })
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => s.getState().add(v.sku)))
    expect(results.filter((r) => r === 'added')).toHaveLength(1)
    expect(results.filter((r) => r === 'busy')).toHaveLength(4)
    expect(s.getState().items).toEqual([{ sku: v.sku, quantity: 1 }])
    expect(calls).toHaveLength(1)
  })

  it('checks rapid quantity changes once, with the final quantity', async () => {
    const v = await product({ initialStock: 10 })
    const { s, calls } = bag()
    await s.getState().add(v.sku)
    for (const q of [2, 3, 4, 5]) s.getState().setQuantity(v.sku, q)
    expect(s.getState().items[0].quantity).toBe(5)
    await settle()
    expect(calls).toHaveLength(2) // the add, then one check for 2→5
    expect(JSON.parse(calls[1]).items).toEqual([{ sku: v.sku, quantity: 5 }])
    expect(quoteIsCurrent(s.getState().items, s.getState().quote)).toBe(true)
    expect(s.getState().quote?.subtotalMinor).toBe(5 * 179900)
  })

  it('never shows an older answer after a newer change', async () => {
    const v = await product({ initialStock: 10 })
    // The check for quantity 2 is slow; the check for quantity 3 is fast.
    const { s } = bag({ delay: (body) => (body.includes('"quantity":2') ? 120 : 5) })
    await s.getState().add(v.sku)
    s.getState().setQuantity(v.sku, 2)
    await settle(40)
    s.getState().setQuantity(v.sku, 3)
    await settle(250)
    expect(s.getState().quote?.lines[0].quantity).toBe(3)
    expect(s.getState().quote?.subtotalMinor).toBe(3 * 179900)
  })

  it('removes items and clears the bag', async () => {
    const a = await product()
    const b = await product({ priceMinor: 50000 })
    const { s, storage } = bag()
    await s.getState().add(a.sku)
    await s.getState().add(b.sku)
    s.getState().remove(a.sku)
    await settle()
    expect(s.getState().quote).toMatchObject({ subtotalMinor: 50000, lines: [{ sku: b.sku }] })
    s.getState().clear()
    await settle()
    expect(s.getState().items).toEqual([])
    expect(s.getState().quote).toBeNull()
    expect(storage.getItem(cartStorageKey(store.code))).toBeNull()
  })

  it('does not add sold-out or unknown items, and limits to what is in stock', async () => {
    const sold = await product({ initialStock: 0 })
    const few = await product({ initialStock: 2 })
    const { s } = bag()
    expect(await s.getState().add(sold.sku)).toBe('unavailable')
    expect(await s.getState().add('NO-SUCH-SKU')).toBe('unavailable')
    expect(s.getState().items).toEqual([])
    expect(await s.getState().add(few.sku, 5)).toBe('limited')
    expect(s.getState().items).toEqual([{ sku: few.sku, quantity: 2 }])
    expect(s.getState().notice?.message).toMatch(/Only 2 available/)
    await settle()
    expect(s.getState().quote?.canCheckout).toBe(true)
  })

  it('keeps the item but blocks checkout when the server cannot be reached', async () => {
    const v = await product()
    const { s } = bag({ down: true })
    expect(await s.getState().add(v.sku)).toBe('unchecked')
    expect(s.getState().items).toEqual([{ sku: v.sku, quantity: 1 }])
    expect(s.getState().status).toBe('error')
    expect(s.getState().error).toMatch(/could not check your bag/)
    expect(quoteIsCurrent(s.getState().items, s.getState().quote)).toBe(false) // so checkout stays closed
  })

  it('shows the new price when it changes while in the bag', async () => {
    const v = await product({ priceMinor: 179900 })
    const first = bag()
    await first.s.getState().add(v.sku)
    await updateVariant(db, store.id, v.id, { salePriceMinor: 150000 })
    const later = bag({ storage: first.storage })
    later.s.getState().hydrate()
    await settle()
    expect(later.s.getState().quote?.lines[0].unitPriceMinor).toBe(150000)
    expect(later.s.getState().seen[v.sku]).toBe(179900) // "Price updated (was Rs. 1,799)"
    later.s.getState().acknowledgePrices()
    expect(later.s.getState().seen[v.sku]).toBe(150000)
  })
})
