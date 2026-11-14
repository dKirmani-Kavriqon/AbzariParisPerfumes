import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCategory, archiveCategory } from '../../src/commerce/catalog/categories'
import { addImage } from '../../src/commerce/catalog/images'
import { adjustStock, setLowStockThreshold } from '../../src/commerce/catalog/inventory'
import { archiveProduct, createProduct, updateProduct } from '../../src/commerce/catalog/products'
import { availabilityOf, buildPublicCatalog } from '../../src/commerce/catalog/public-build'
import { displayPrice, leadVariant, queryProducts, type PublicCatalog } from '../../src/commerce/catalog/public'
import { clearStoreCache, type StoreContext } from '../../src/commerce/catalog/store'
import { createCategorySchema, createProductSchema, stockAdjustmentSchema } from '../../src/commerce/catalog/validation'
import { updateVariant } from '../../src/commerce/catalog/variants'
import type { ApiDeps } from '../../src/server/api/deps'
import { buildApi } from '../../src/server/api/routes'
import { clearCatalogMemory, getPublishedCatalog, publishCatalog } from '../../src/server/catalog/publish'
import type { Db } from '../../src/server/db/types'
import { getServerEnv } from '../../src/server/env'
import { memoryStore } from '../../src/server/storage/object-store'
import { createTestDb, newStore, uniq } from '../helpers/db'

let db: Db
let close: () => Promise<void>
let store: StoreContext
let other: StoreContext
let catCode: string
const api = buildApi()

beforeAll(async () => {
  ;({ db, close } = await createTestDb())
  store = await newStore(db)
  other = await newStore(db)
  catCode = uniq('frag')
}, 60_000)
afterAll(() => close())
beforeEach(() => {
  clearCatalogMemory()
  clearStoreCache()
})

const variant = (o: Record<string, unknown> = {}) => ({ sku: uniq('SKU').toUpperCase(), priceMinor: 179900, ...o })
const make = (s: StoreContext, o: Record<string, unknown>) => createProduct(db, s, createProductSchema.parse({ name: `P ${uniq()}`, status: 'active', ...o }), 'test')
const build = async (s: StoreContext = store) => (await buildPublicCatalog(db, s)).catalog
const find = (c: PublicCatalog, slug: string) => c.products.find((p) => p.slug === slug)

describe('public catalogue contents', () => {
  it('includes live products with public fields only', async () => {
    const cat = await createCategory(db, store.id, createCategorySchema.parse({ name: `Parfum ${catCode}`, slug: catCode }))
    const p = await make(store, {
      slug: uniq('rawah'),
      brand: 'Abzari Paris',
      fullDescription: 'An oud built for evening.',
      categoryIds: [cat.id],
      details: { notes: [{ tier: 'Top', notes: ['Woody', 'Balsamic'] }] },
      variants: [variant({ title: '50ml Eau de Parfum', salePriceMinor: 150000, initialStock: 8, lowStockThreshold: 2 })],
    })
    await addImage(db, store.id, p.id, { source: 'static', storageKey: `/products/${uniq('a')}.webp`, altText: 'Front' })
    const c = await build()
    const pub = find(c, p.slug)!
    expect(pub).toMatchObject({
      name: p.name,
      brand: 'Abzari Paris',
      description: 'An oud built for evening.',
      categories: [catCode],
      notes: [{ tier: 'Top', notes: ['Woody', 'Balsamic'] }],
      availability: 'in_stock',
      variants: [{ title: '50ml Eau de Parfum', priceMinor: 179900, salePriceMinor: 150000, currency: 'INR', availability: 'in_stock' }],
      images: [{ alt: 'Front' }],
    })
    const json = JSON.stringify(c)
    expect(json).not.toContain(p.id) // no database ids
    expect(json).not.toContain(store.id)
    expect(json).not.toMatch(/availableQuantity|reserved|threshold|"actor"/) // no stock counts or admin data
  })

  it('shows what a shopper pays and the struck-through price', async () => {
    const p = await make(store, { variants: [variant({ priceMinor: 179900, salePriceMinor: 150000, initialStock: 1 })] })
    const v = leadVariant(find(await build(), p.slug)!)!
    expect(displayPrice(v)).toEqual({ price: 150000, compareAt: 179900 })
    await updateVariant(db, store.id, p.variants[0].id, { salePriceMinor: null })
    expect(displayPrice(leadVariant(find(await build(), p.slug)!)!)).toEqual({ price: 179900, compareAt: null })
  })

  it('reports availability from real stock, without counts', async () => {
    expect(availabilityOf(0, 0, 0)).toBe('out_of_stock')
    expect(availabilityOf(3, 3, 0)).toBe('out_of_stock') // all reserved
    expect(availabilityOf(2, 0, 2)).toBe('low_stock')
    expect(availabilityOf(10, 0, 2)).toBe('in_stock')
    expect(availabilityOf(-5 as number, 0, 0)).toBe('out_of_stock') // never negative

    const p = await make(store, { variants: [variant({ initialStock: 0 })] })
    expect(find(await build(), p.slug)!.availability).toBe('out_of_stock')
    await adjustStock(db, store.id, p.variants[0].id, stockAdjustmentSchema.parse({ type: 'restock', quantityChange: 2 }), null)
    await setLowStockThreshold(db, store.id, p.variants[0].id, 3)
    expect(find(await build(), p.slug)!.availability).toBe('low_stock')
  })

  it('shows live products without a variant as coming soon', async () => {
    const p = await make(store, {})
    expect(find(await build(), p.slug)).toMatchObject({ availability: 'coming_soon', variants: [] })
  })

  it('never includes drafts, archived products, inactive variants or hidden categories', async () => {
    const draft = await make(store, { status: 'draft', variants: [variant({ initialStock: 1 })] })
    const gone = await make(store, { variants: [variant({ initialStock: 1 })] })
    await archiveProduct(db, store.id, gone.id)
    const mixed = await make(store, { variants: [variant({ initialStock: 1 }), variant({ initialStock: 1 })] })
    await updateVariant(db, store.id, mixed.variants[1].id, { status: 'inactive' })
    const hidden = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('h'), status: 'hidden' }))
    const archivedCat = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('x') }))
    await archiveCategory(db, store.id, archivedCat.id)

    const c = await build()
    expect(find(c, draft.slug)).toBeUndefined()
    expect(find(c, gone.slug)).toBeUndefined()
    expect(find(c, mixed.slug)!.variants.map((v) => v.sku)).toEqual([mixed.variants[0].sku])
    expect(c.categories.map((x) => x.slug)).not.toContain(hidden.slug)
    expect(c.categories.map((x) => x.slug)).not.toContain(archivedCat.slug)
  })

  it('keeps image order with the primary image first', async () => {
    const p = await make(store, {})
    const a = await addImage(db, store.id, p.id, { source: 'static', storageKey: `/products/${uniq('a')}.webp` })
    await addImage(db, store.id, p.id, { source: 'static', storageKey: `/products/${uniq('b')}.webp` })
    const c3 = await addImage(db, store.id, p.id, { source: 'static', storageKey: `/products/${uniq('c')}.webp` })
    const { setPrimaryImage } = await import('../../src/commerce/catalog/images')
    await setPrimaryImage(db, store.id, c3.id)
    const urls = find(await build(), p.slug)!.images.map((i) => i.url)
    expect(urls[0]).toBe(c3.storageKey)
    expect(urls).toContain(a.storageKey)
  })

  it('contains only its own store’s products', async () => {
    const mine = await make(store, { variants: [variant({ initialStock: 1 })] })
    const theirs = await make(other, { variants: [variant({ initialStock: 1 })] })
    const c = await build(store)
    expect(find(c, mine.slug)).toBeDefined()
    expect(find(c, theirs.slug)).toBeUndefined()
    expect(c.store).toBe(store.code)
  })
})

describe('search, filtering and sorting', () => {
  it('filters by category including subcategories, searches and sorts', async () => {
    const parent = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('fam') }))
    const child = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('sub'), parentId: parent.id }))
    const tag = uniq('zq')
    const cheap = await make(store, { name: `Amber ${tag}`, categoryIds: [child.id], variants: [variant({ priceMinor: 50000, initialStock: 1 })] })
    const dear = await make(store, { name: `Oud ${tag}`, categoryIds: [parent.id], variants: [variant({ priceMinor: 90000, salePriceMinor: 80000, initialStock: 0 })] })
    const c = await build()
    expect(queryProducts(c, { category: parent.slug }).map((p) => p.slug).sort()).toEqual([cheap.slug, dear.slug].sort())
    expect(queryProducts(c, { category: child.slug }).map((p) => p.slug)).toEqual([cheap.slug])
    expect(queryProducts(c, { q: `oud ${tag}` }).map((p) => p.slug)).toEqual([dear.slug])
    expect(queryProducts(c, { q: tag, availability: 'available' }).map((p) => p.slug)).toEqual([cheap.slug])
    expect(queryProducts(c, { q: tag, sort: 'price-desc' }).map((p) => p.slug)).toEqual([dear.slug, cheap.slug])
    expect(queryProducts(c, { q: tag, sort: 'price-asc' }).map((p) => p.slug)).toEqual([cheap.slug, dear.slug])
  })
})

describe('public API, publishing and images', () => {
  const objects = memoryStore()
  const deps = (o: Partial<ApiDeps> = {}): ApiDeps => ({
    db: () => db,
    env: () => getServerEnv({ APP_ENV: 'development', ADMIN_LOCAL_DEV: '1' }),
    storeCode: store.code,
    storeName: 'Test',
    objectStore: () => objects,
    fetch: () => Promise.reject(new Error('offline')),
    ...o,
  })
  const get = (path: string, d = deps(), headers: Record<string, string> = {}) => api.handle(new Request(`http://localhost:3000${path}`, { headers }), d)

  it('serves the catalogue with an ETag and answers 304 when unchanged', async () => {
    const res = await get('/api/catalog')
    expect(res.status).toBe(200)
    const etag = res.headers.get('etag')!
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
    expect((await res.json()).data.store).toBe(store.code)
    expect((await get('/api/catalog', deps(), { 'if-none-match': etag })).status).toBe(304)
  })

  it('lists, searches, filters and returns details with validated parameters', async () => {
    const tag = uniq('api')
    const p = await make(store, { name: `Searchable ${tag}`, variants: [variant({ initialStock: 1 })] })
    await publishCatalog(deps())
    const list = await (await get(`/api/catalog/products?q=${tag}&sort=price-asc&availability=available`)).json()
    expect(list.data).toMatchObject({ total: 1, items: [{ slug: p.slug }] })
    expect((await (await get(`/api/catalog/products/${p.slug}`)).json()).data.slug).toBe(p.slug)
    expect((await get('/api/catalog/products/does-not-exist')).status).toBe(404)
    expect((await get('/api/catalog/products?sort=evil')).status).toBe(422)
    expect((await get('/api/catalog/products?limit=1000')).status).toBe(422)
    expect((await get('/api/catalog/products/Bad%20Slug')).status).toBe(422)
    expect((await get('/api/catalog/products?category=..%2F..')).status).toBe(422)
    expect((await (await get('/api/catalog/categories')).json()).ok).toBe(true)
  })

  it('reflects admin changes immediately: every admin write republishes', async () => {
    const created = await api.handle(
      new Request('http://localhost:3000/api/admin/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'kce-admin' },
        body: JSON.stringify({ name: `Fresh ${uniq()}`, status: 'active', variants: [variant({ initialStock: 3 })] }),
      }),
      deps(),
    )
    expect(created.status).toBe(201)
    expect(created.headers.get('x-catalog-published')).toBe('true')
    const slug = (await created.json()).data.slug
    expect(find((await getPublishedCatalog(deps())).catalog, slug)?.availability).toBe('in_stock')

    // Archive through the API: gone from the public catalogue straight away.
    const id = (await (await api.handle(new Request(`http://localhost:3000/api/admin/products?q=${slug}`), deps())).json()).data.items[0].id
    await api.handle(new Request(`http://localhost:3000/api/admin/products/${id}/archive`, { method: 'POST', headers: { 'x-requested-with': 'kce-admin' } }), deps())
    expect((await get(`/api/catalog/products/${slug}`)).status).toBe(404)
  })

  it('never lets an older copy replace a newer published catalogue', async () => {
    const newer = await publishCatalog(deps())
    const key = `stores/${store.code}/catalog/public.json`
    // Simulate a stored copy from the future (a later publish that finished first).
    await objects.put(key, new TextEncoder().encode(JSON.stringify({ catalog: { ...newer.catalog, generatedAt: '2999-01-01T00:00:00.000Z' }, mediaKeys: [] })), { contentType: 'application/json' })
    const result = await publishCatalog(deps())
    expect(result.catalog.generatedAt).toBe('2999-01-01T00:00:00.000Z')
  })

  it('serves only approved images: this store, a live product, still attached', async () => {
    clearCatalogMemory()
    await objects.delete(`stores/${store.code}/catalog/public.json`)
    const p = await make(store, { variants: [variant({ initialStock: 1 })] })
    const draft = await make(store, { status: 'draft' })
    const key = `stores/${store.code}/products/${p.id}/${'a'.repeat(32)}.png`
    const draftKey = `stores/${store.code}/products/${draft.id}/${'b'.repeat(32)}.png`
    const otherKey = `stores/${other.code}/products/${p.id}/${'c'.repeat(32)}.png`
    for (const k of [key, draftKey, otherKey]) await objects.put(k, new Uint8Array([137, 80, 78, 71]), { contentType: 'image/png' })
    await addImage(db, store.id, p.id, { source: 'object', storageKey: key })
    await addImage(db, store.id, draft.id, { source: 'object', storageKey: draftKey })
    await publishCatalog(deps())

    const ok = await get(`/media/${key}`)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('public, max-age=86400')
    expect((await get(`/media/${draftKey}`)).status).toBe(404) // draft product: not public
    expect((await get(`/media/${otherKey}`)).status).toBe(404) // another store's key
    expect((await get('/media/stores/x/../../secret.png')).status).toBe(404)
    expect((await get(`/media/stores/${store.code}/products/${p.id}/${'d'.repeat(32)}.png`)).status).toBe(404) // missing object
    // The admin can still see the draft's image through the admin route.
    expect((await get(`/api/admin/media/${draftKey}`)).status).toBe(200)

    await updateProduct(db, store.id, p.id, { status: 'draft' })
    await publishCatalog(deps())
    expect((await get(`/media/${key}`)).status).toBe(404) // unpublished product: image withdrawn
  })

  it('answers 503 when neither storage nor the database is available, and serves the last good copy otherwise', async () => {
    const broken = deps({ objectStore: () => null, db: () => ({ execute: () => Promise.reject(new Error('db down')), select: () => { throw new Error('db down') } }) as never })
    clearCatalogMemory()
    const res = await get('/api/catalog', broken)
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).not.toMatch(/db down/)

    await getPublishedCatalog(deps({ objectStore: () => null })) // a good copy in memory
    expect((await get('/api/catalog', broken)).status).toBe(200)
  })
})

describe('no hardcoded catalogue in the running site', () => {
  it('no file under src/ imports the seed data', () => {
    const files: string[] = []
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(n)) files.push(p)
      }
    }
    walk('src')
    const offenders = files.filter((f) => /abzari-products|data\/products/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
