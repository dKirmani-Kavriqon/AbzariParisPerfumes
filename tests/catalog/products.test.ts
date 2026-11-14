import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { archiveCategory, createCategory, listCategories, restoreCategory, updateCategory } from '../../src/commerce/catalog/categories'
import { archiveProduct, createProduct, getProduct, listProducts, restoreProduct, setProductCategories, updateProduct } from '../../src/commerce/catalog/products'
import type { StoreContext } from '../../src/commerce/catalog/store'
import { createCategorySchema, createProductSchema, productListQuerySchema, updateProductSchema } from '../../src/commerce/catalog/validation'
import { createVariant, isSkuAvailable, updateVariant } from '../../src/commerce/catalog/variants'
import { products, productVariants } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/types'
import { AppError } from '../../src/server/http/errors'
import { createTestDb, newStore, uniq } from '../helpers/db'

let db: Db
let close: () => Promise<void>
let store: StoreContext

beforeAll(async () => {
  ;({ db, close } = await createTestDb())
  store = await newStore(db)
}, 60_000)
afterAll(() => close())

const product = (over: Record<string, unknown> = {}) => createProductSchema.parse({ name: `Product ${uniq()}`, ...over })
const variant = (over: Record<string, unknown> = {}) => ({ sku: uniq('SKU').toUpperCase(), priceMinor: 150000, ...over })

async function rejects(p: Promise<unknown>, status: number, field?: string) {
  const err = await p.then(
    () => undefined,
    (e) => e,
  )
  expect(err, 'expected the call to fail').toBeInstanceOf(AppError)
  expect((err as AppError).status).toBe(status)
  if (field) expect(Object.keys(((err as AppError).details ?? {}) as object)).toContain(field)
}

describe('products', () => {
  it('creates a product with variants, stock and categories in one go', async () => {
    const cat = await createCategory(db, store.id, createCategorySchema.parse({ name: `Parfum ${uniq()}` }))
    const p = await createProduct(
      db,
      store,
      product({ name: 'Élan Noir', slug: uniq('elan'), categoryIds: [cat.id], variants: [variant({ title: '50 ml', initialStock: 12, salePriceMinor: 120000 })] }),
      'owner@example.com',
    )
    expect(p.status).toBe('draft')
    expect(p.categories.map((c) => c.id)).toEqual([cat.id])
    expect(p.variants).toHaveLength(1)
    expect(p.variants[0]).toMatchObject({ priceMinor: 150000, salePriceMinor: 120000, currency: 'INR', availableQuantity: 12 })
  })

  it('generates a slug from the name when none is given', async () => {
    const name = `Oud Blanc ${uniq()}`
    const p = await createProduct(db, store, product({ name }), null)
    expect(p.slug).toMatch(/^oud-blanc-/)
  })

  it('rejects a duplicate slug within the store', async () => {
    const slug = uniq('dup')
    await createProduct(db, store, product({ slug }), null)
    await rejects(createProduct(db, store, product({ slug }), null), 409, 'slug')
  })

  it('allows the same slug in a different store', async () => {
    const other = await newStore(db)
    const slug = uniq('shared')
    await createProduct(db, store, product({ slug }), null)
    await expect(createProduct(db, other, product({ slug }), null)).resolves.toMatchObject({ slug })
  })

  it('validates names, slugs and SEO lengths before touching the database', () => {
    expect(createProductSchema.safeParse({ name: '' }).success).toBe(false)
    expect(createProductSchema.safeParse({ name: 'A', slug: 'Not A Slug' }).success).toBe(false)
    expect(createProductSchema.safeParse({ name: 'A', slug: 'a--b' }).success).toBe(false)
    expect(createProductSchema.safeParse({ name: 'A', seoTitle: 'x'.repeat(71) }).success).toBe(false)
    expect(updateProductSchema.safeParse({}).success).toBe(false)
  })

  it('updates fields and refuses a slug taken by another product', async () => {
    const a = await createProduct(db, store, product(), null)
    const b = await createProduct(db, store, product(), null)
    const updated = await updateProduct(db, store.id, a.id, { name: 'Renamed', featured: true, status: 'active' })
    expect(updated).toMatchObject({ name: 'Renamed', featured: true, status: 'active' })
    await rejects(updateProduct(db, store.id, a.id, { slug: b.slug }), 409, 'slug')
  })

  it('archives and restores without deleting anything', async () => {
    const p = await createProduct(db, store, product({ status: 'active', featured: true, variants: [variant()] }), null)
    const archived = await archiveProduct(db, store.id, p.id)
    expect(archived.status).toBe('archived')
    expect(archived.archivedAt).not.toBeNull()
    expect(archived.featured).toBe(false)
    expect(archived.variants).toHaveLength(1) // variants kept for future order history
    await rejects(updateProduct(db, store.id, p.id, { name: 'x' }), 409)

    const listed = await listProducts(db, store.id, productListQuerySchema.parse({}))
    expect(listed.items.map((i) => i.id)).not.toContain(p.id)
    const archivedList = await listProducts(db, store.id, productListQuerySchema.parse({ status: 'archived' }))
    expect(archivedList.items.map((i) => i.id)).toContain(p.id)

    const restored = await restoreProduct(db, store.id, p.id)
    expect(restored).toMatchObject({ status: 'draft', archivedAt: null })
  })

  it('searches by name and by SKU, treating % and _ literally', async () => {
    const tag = uniq('zq')
    const sku = `${tag.toUpperCase()}-SKU`
    const p = await createProduct(db, store, product({ name: `Searchable ${tag}`, variants: [variant({ sku })] }), null)
    const byName = await listProducts(db, store.id, productListQuerySchema.parse({ q: tag }))
    expect(byName.items.map((i) => i.id)).toEqual([p.id])
    const bySku = await listProducts(db, store.id, productListQuerySchema.parse({ q: sku.toLowerCase() }))
    expect(bySku.items.map((i) => i.id)).toEqual([p.id])
    const wildcard = await listProducts(db, store.id, productListQuerySchema.parse({ q: '%' }))
    expect(wildcard.total).toBe(0)
  })

  it('summarises price and stock in the list', async () => {
    const tag = uniq('sum')
    await createProduct(db, store, product({ name: tag, variants: [variant({ priceMinor: 50000, initialStock: 3 }), variant({ priceMinor: 90000, salePriceMinor: 40000, initialStock: 4 })] }), null)
    const { items } = await listProducts(db, store.id, productListQuerySchema.parse({ q: tag }))
    expect(items[0]).toMatchObject({ variantCount: 2, minPriceMinor: 40000, totalStock: 7, currency: 'INR' })
  })
})

describe('categories', () => {
  it('nests categories and counts products', async () => {
    const parent = await createCategory(db, store.id, createCategorySchema.parse({ name: `Fragrance ${uniq()}` }))
    const child = await createCategory(db, store.id, createCategorySchema.parse({ name: `EDP ${uniq()}`, parentId: parent.id }))
    await createProduct(db, store, product({ categoryIds: [child.id] }), null)
    const all = await listCategories(db, store.id)
    expect(all.find((c) => c.id === child.id)).toMatchObject({ parentId: parent.id, productCount: 1 })
  })

  it('refuses loops and over-deep nesting', async () => {
    const a = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('a') }))
    const b = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('b'), parentId: a.id }))
    const c = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('c'), parentId: b.id }))
    const d = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('d'), parentId: c.id }))
    await rejects(updateCategory(db, store.id, a.id, { parentId: c.id }), 422, 'parentId') // loop
    await rejects(updateCategory(db, store.id, a.id, { parentId: a.id }), 422, 'parentId') // itself
    await rejects(createCategory(db, store.id, createCategorySchema.parse({ name: uniq('e'), parentId: d.id })), 422, 'parentId') // 5th level
  })

  it('refuses a duplicate slug, and archiving a category that still has subcategories', async () => {
    const slug = uniq('cat')
    const parent = await createCategory(db, store.id, createCategorySchema.parse({ name: 'X', slug }))
    await rejects(createCategory(db, store.id, createCategorySchema.parse({ name: 'Y', slug })), 409, 'slug')
    const child = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('child'), parentId: parent.id }))
    await rejects(archiveCategory(db, store.id, parent.id), 409)
    await archiveCategory(db, store.id, child.id)
    await expect(archiveCategory(db, store.id, parent.id)).resolves.toMatchObject({ status: 'archived' })
    await rejects(restoreCategory(db, store.id, child.id), 409) // parent still archived
  })

  it('assigns, reorders and clears product categories; refuses archived ones', async () => {
    const one = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('one') }))
    const two = await createCategory(db, store.id, createCategorySchema.parse({ name: uniq('two') }))
    const p = await createProduct(db, store, product(), null)
    expect((await setProductCategories(db, store.id, p.id, [two.id, one.id])).categories.map((c) => c.id)).toEqual([two.id, one.id])
    expect((await setProductCategories(db, store.id, p.id, [])).categories).toEqual([])
    await archiveCategory(db, store.id, one.id)
    await rejects(setProductCategories(db, store.id, p.id, [one.id]), 422, 'categoryIds')
  })
})

describe('variants and SKUs', () => {
  it('creates a variant with its own stock record', async () => {
    const p = await createProduct(db, store, product(), null)
    const v = await createVariant(db, store, p.id, { ...variant(), title: '100 ml', barcode: null, options: { Size: '100 ml' }, salePriceMinor: null, weightGrams: 300, lengthMm: null, widthMm: null, heightMm: null, status: 'active', initialStock: 5, lowStockThreshold: 2 }, null)
    expect(v).toMatchObject({ title: '100 ml', options: { Size: '100 ml' }, availableQuantity: 5, lowStockThreshold: 2, weightGrams: 300 })
  })

  it('rejects a SKU already used in the store, or repeated in one request', async () => {
    const sku = uniq('SKU').toUpperCase()
    await createProduct(db, store, product({ variants: [variant({ sku })] }), null)
    expect(await isSkuAvailable(db, store.id, sku)).toBe(false)
    await rejects(createProduct(db, store, product({ variants: [variant({ sku })] }), null), 409, 'sku')
    await rejects(createProduct(db, store, product({ variants: [variant({ sku: 'SAME-1' }), variant({ sku: 'SAME-1' })] }), null), 409, 'sku')
  })

  it('lets another store use the same SKU', async () => {
    const other = await newStore(db)
    const sku = uniq('SKU').toUpperCase()
    await createProduct(db, store, product({ variants: [variant({ sku })] }), null)
    expect(await isSkuAvailable(db, other.id, sku)).toBe(true)
  })

  it('enforces the price rules in the schema, the service and the database', async () => {
    expect(createProductSchema.safeParse({ name: 'A', variants: [variant({ priceMinor: 100, salePriceMinor: 100 })] }).success).toBe(false)
    expect(createProductSchema.safeParse({ name: 'A', variants: [variant({ priceMinor: -1 })] }).success).toBe(false)
    expect(createProductSchema.safeParse({ name: 'A', variants: [variant({ priceMinor: 10.5 })] }).success).toBe(false)
    expect(createProductSchema.safeParse({ name: 'A', variants: [variant({ currency: 'XYZ' })] }).success).toBe(false)

    const p = await createProduct(db, store, product({ variants: [variant({ priceMinor: 1000, salePriceMinor: 800 })] }), null)
    const v = p.variants[0]
    await rejects(updateVariant(db, store.id, v.id, { priceMinor: 700 }), 422, 'salePriceMinor') // would put sale above regular
    await expect(updateVariant(db, store.id, v.id, { priceMinor: 700, salePriceMinor: null })).resolves.toMatchObject({ priceMinor: 700, salePriceMinor: null })
    // Even a direct write that skips the service is refused by the database.
    await expect(db.update(productVariants).set({ salePriceMinor: 5000 }).where(eq(productVariants.id, v.id))).rejects.toThrow()
  })

  it('refuses to change a SKU to one already in use', async () => {
    const p = await createProduct(db, store, product({ variants: [variant(), variant()] }), null)
    await rejects(updateVariant(db, store.id, p.variants[1].id, { sku: p.variants[0].sku }), 409, 'sku')
  })
})

describe('transactions', () => {
  it('saves nothing when one statement in a product creation fails', async () => {
    const slug = uniq('rollback')
    // Bypass the schema so the second variant reaches the database with an invalid sale price.
    const input = { ...product({ slug }), variants: [{ ...variant(), barcode: null, title: '', options: {}, salePriceMinor: null, currency: 'INR', weightGrams: null, lengthMm: null, widthMm: null, heightMm: null, status: 'active' as const, initialStock: 1, lowStockThreshold: 0 }, { ...variant({ priceMinor: 100 }), barcode: null, title: '', options: {}, salePriceMinor: 500, currency: 'INR', weightGrams: null, lengthMm: null, widthMm: null, heightMm: null, status: 'active' as const, initialStock: 0, lowStockThreshold: 0 }] }
    await rejects(createProduct(db, store, input, null), 422)
    const left = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug))
    expect(left).toEqual([]) // the product row was rolled back with the failing variant
  })

  it('getProduct returns 404 for unknown ids', async () => {
    await rejects(getProduct(db, store.id, crypto.randomUUID()), 404)
  })
})
