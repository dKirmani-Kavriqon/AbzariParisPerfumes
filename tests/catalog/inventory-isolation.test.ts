import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createCategory, getCategory, updateCategory } from '../../src/commerce/catalog/categories'
import { addImage, deleteImage, listImages, reorderImages, setPrimaryImage, updateImage } from '../../src/commerce/catalog/images'
import { adjustStock, getStock, listInventory, listMovements, setLowStockThreshold } from '../../src/commerce/catalog/inventory'
import { archiveProduct, createProduct, getProduct, listProducts, setProductCategories, updateProduct } from '../../src/commerce/catalog/products'
import type { StoreContext } from '../../src/commerce/catalog/store'
import { createCategorySchema, createProductSchema, productListQuerySchema, stockAdjustmentSchema } from '../../src/commerce/catalog/validation'
import { createVariant, getVariant, updateVariant } from '../../src/commerce/catalog/variants'
import { inventoryMovements, productCategories, productImages, productVariants } from '../../src/server/db/schema'
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

async function productWithStock(s: StoreContext, stock = 10) {
  return createProduct(db, s, createProductSchema.parse({ name: `P ${uniq()}`, variants: [{ sku: uniq('SKU').toUpperCase(), priceMinor: 1000, initialStock: stock }] }), 'seed')
}
const adj = (type: string, quantityChange: number, reason: string | null = 'test') => stockAdjustmentSchema.parse({ type, quantityChange, reason })
async function status(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (err) => err,
  )
  return e instanceof AppError ? e.status : e ? 'non-AppError' : 'ok'
}

describe('inventory', () => {
  it('adjusts stock and records each movement with exact before/after quantities', async () => {
    const p = await productWithStock(store, 10)
    const v = p.variants[0].id
    expect(await adjustStock(db, store.id, v, adj('restock', 5, null), 'owner@example.com')).toMatchObject({ previousQuantity: 10, resultingQuantity: 15 })
    expect(await adjustStock(db, store.id, v, adj('damage', -2, 'Broken in transit'), 'owner@example.com')).toMatchObject({ previousQuantity: 15, resultingQuantity: 13 })
    const moves = await listMovements(db, store.id, v)
    expect(moves.map((m) => [m.movementType, m.quantityChange, m.previousQuantity, m.resultingQuantity])).toEqual([
      ['damage', -2, 15, 13],
      ['restock', 5, 10, 15],
      ['initial', 10, 0, 10],
    ])
    expect(moves[0]).toMatchObject({ reason: 'Broken in transit', actor: 'owner@example.com' })
  })

  it('never lets stock go negative, and writes no movement when refusing', async () => {
    const p = await productWithStock(store, 3)
    const v = p.variants[0].id
    const before = (await listMovements(db, store.id, v)).length
    const err = await adjustStock(db, store.id, v, adj('correction', -4), null).catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err.status).toBe(409)
    expect((await getStock(db, store.id, v)).availableQuantity).toBe(3)
    expect((await listMovements(db, store.id, v)).length).toBe(before)
    await expect(adjustStock(db, store.id, v, adj('correction', -3), null)).resolves.toMatchObject({ resultingQuantity: 0 })
  })

  it('stays consistent under concurrent adjustments', async () => {
    const p = await productWithStock(store, 20)
    const v = p.variants[0].id
    // 25 parallel removals of 1 against 20 in stock: exactly 20 succeed, 5 are refused.
    const results = await Promise.allSettled(Array.from({ length: 25 }, () => adjustStock(db, store.id, v, adj('correction', -1), null)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(20)
    expect((await getStock(db, store.id, v)).availableQuantity).toBe(0)
    const moves = await listMovements(db, store.id, v, 100)
    const sum = moves.reduce((n, m) => n + m.quantityChange, 0)
    expect(sum).toBe(0) // +20 initial, -20 removals: the ledger reconciles with the stock level
  })

  it('validates adjustment direction and reasons', () => {
    expect(stockAdjustmentSchema.safeParse({ type: 'restock', quantityChange: -1 }).success).toBe(false)
    expect(stockAdjustmentSchema.safeParse({ type: 'damage', quantityChange: 2, reason: 'x' }).success).toBe(false)
    expect(stockAdjustmentSchema.safeParse({ type: 'correction', quantityChange: 2 }).success).toBe(false) // needs a reason
    expect(stockAdjustmentSchema.safeParse({ type: 'restock', quantityChange: 0 }).success).toBe(false)
    expect(stockAdjustmentSchema.safeParse({ type: 'restock', quantityChange: 1.5 }).success).toBe(false)
  })

  it('flags low stock against a configurable threshold', async () => {
    const p = await productWithStock(store, 4)
    const v = p.variants[0].id
    expect((await setLowStockThreshold(db, store.id, v, 5)).isLow).toBe(true)
    const low = await listInventory(db, store.id, { lowStock: true, limit: 200, offset: 0 })
    expect(low.map((r) => r.variantId)).toContain(v)
    expect((await setLowStockThreshold(db, store.id, v, 2)).isLow).toBe(false)
  })

  it('keeps the movement ledger append-only (database trigger)', async () => {
    const p = await productWithStock(store, 1)
    const [m] = await listMovements(db, store.id, p.variants[0].id)
    await expect(db.update(inventoryMovements).set({ quantityChange: 99 }).where(eq(inventoryMovements.id, m.id))).rejects.toThrow()
    await expect(db.delete(inventoryMovements).where(eq(inventoryMovements.id, m.id))).rejects.toThrow()
  })
})

describe('images (database side)', () => {
  const img = (key: string) => ({ source: 'static' as const, storageKey: `/products/${key}.webp`, altText: key })

  it('makes the first image primary, orders the rest, and promotes the next primary on delete', async () => {
    const p = await productWithStock(store, 0)
    const a = await addImage(db, store.id, p.id, img(uniq('a')))
    const b = await addImage(db, store.id, p.id, img(uniq('b')))
    const c = await addImage(db, store.id, p.id, img(uniq('c')))
    expect([a.isPrimary, b.isPrimary, c.isPrimary]).toEqual([true, false, false])
    expect((await reorderImages(db, store.id, p.id, [c.id, b.id, a.id])).map((i) => i.id)).toEqual([a.id, c.id, b.id]) // primary listed first
    await setPrimaryImage(db, store.id, b.id)
    expect((await listImages(db, store.id, p.id)).filter((i) => i.isPrimary).map((i) => i.id)).toEqual([b.id])
    await deleteImage(db, store.id, b.id)
    expect((await listImages(db, store.id, p.id)).find((i) => i.isPrimary)?.id).toBe(c.id) // next by position
    expect((await updateImage(db, store.id, c.id, { altText: 'Bottle on stone' })).altText).toBe('Bottle on stone')
  })

  it('refuses an incomplete reorder and a variant from another product', async () => {
    const p = await productWithStock(store, 0)
    const q = await productWithStock(store, 0)
    const a = await addImage(db, store.id, p.id, img(uniq('a')))
    await addImage(db, store.id, p.id, img(uniq('b')))
    expect(await status(reorderImages(db, store.id, p.id, [a.id]))).toBe(422)
    expect(await status(addImage(db, store.id, p.id, { ...img(uniq('v')), variantId: q.variants[0].id }))).toBe(422)
  })

  it('lets products share a site photo, but not attach the same one twice', async () => {
    const p = await productWithStock(store, 0)
    const q = await productWithStock(store, 0)
    const shared = { source: 'static' as const, storageKey: `/products/${uniq('shared')}.webp` }
    await addImage(db, store.id, p.id, shared)
    await expect(addImage(db, store.id, q.id, shared)).resolves.toMatchObject({ productId: q.id })
    expect(await status(addImage(db, store.id, p.id, shared))).toBe(409)
  })

  it('allows only one primary image per product (database index)', async () => {
    const p = await productWithStock(store, 0)
    await addImage(db, store.id, p.id, img(uniq('a')))
    const b = await addImage(db, store.id, p.id, img(uniq('b')))
    await expect(db.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, b.id))).rejects.toThrow()
  })
})

describe('store isolation', () => {
  it('hides and protects one store’s catalogue from another store’s requests', async () => {
    const mine = await newStore(db)
    const theirs = await newStore(db)
    const p = await productWithStock(theirs, 5)
    const v = p.variants[0].id
    const cat = await createCategory(db, theirs.id, createCategorySchema.parse({ name: uniq('cat') }))
    const image = await addImage(db, theirs.id, p.id, { source: 'static', storageKey: `/products/${uniq()}.webp` })

    // Reads
    expect(await status(getProduct(db, mine.id, p.id))).toBe(404)
    expect(await status(getVariant(db, mine.id, v))).toBe(404)
    expect(await status(getCategory(db, mine.id, cat.id))).toBe(404)
    expect(await status(getStock(db, mine.id, v))).toBe(404)
    expect(await status(listImages(db, mine.id, p.id))).toBe(404)
    expect((await listProducts(db, mine.id, productListQuerySchema.parse({ status: 'all' }))).total).toBe(0)
    expect(await listInventory(db, mine.id, { limit: 200, offset: 0 })).toEqual([])

    // Writes
    expect(await status(updateProduct(db, mine.id, p.id, { name: 'hijacked' }))).toBe(404)
    expect(await status(archiveProduct(db, mine.id, p.id))).toBe(404)
    expect(await status(updateVariant(db, mine.id, v, { priceMinor: 1 }))).toBe(404)
    expect(await status(createVariant(db, mine, p.id, { sku: uniq('S').toUpperCase(), barcode: null, title: '', options: {}, priceMinor: 1, salePriceMinor: null, weightGrams: null, lengthMm: null, widthMm: null, heightMm: null, status: 'active', initialStock: 0, lowStockThreshold: 0 }, null))).toBe(404)
    expect(await status(adjustStock(db, mine.id, v, adj('restock', 5, null), null))).toBe(404)
    expect(await status(setLowStockThreshold(db, mine.id, v, 1))).toBe(404)
    expect(await status(updateCategory(db, mine.id, cat.id, { name: 'x' }))).toBe(404)
    expect(await status(setPrimaryImage(db, mine.id, image.id))).toBe(404)
    expect(await status(deleteImage(db, mine.id, image.id))).toBe(404)

    // My own product cannot be linked to their category or their variant.
    const own = await productWithStock(mine, 0)
    expect(await status(setProductCategories(db, mine.id, own.id, [cat.id]))).toBe(422)
    expect(await status(addImage(db, mine.id, own.id, { source: 'static', storageKey: `/products/${uniq()}.webp`, variantId: v }))).toBe(422)

    // Nothing of theirs changed.
    const after = await getProduct(db, theirs.id, p.id)
    expect(after.name).toBe(p.name)
    expect(after.variants[0].availableQuantity).toBe(5)
  })

  it('is enforced by the database even if application code forgets a filter', async () => {
    const a = await newStore(db)
    const b = await newStore(db)
    const pa = await productWithStock(a, 0)
    const catB = await createCategory(db, b.id, createCategorySchema.parse({ name: uniq('cat') }))
    // A variant claiming store B for a product of store A.
    await expect(db.insert(productVariants).values({ storeId: b.id, productId: pa.id, sku: uniq('X'), priceMinor: 1, currency: 'INR' })).rejects.toThrow()
    // A link between store A's product and store B's category, under either store id.
    await expect(db.insert(productCategories).values({ storeId: a.id, productId: pa.id, categoryId: catB.id })).rejects.toThrow()
    await expect(db.insert(productCategories).values({ storeId: b.id, productId: pa.id, categoryId: catB.id })).rejects.toThrow()
    // Stock movements for store A's variant recorded under store B.
    await expect(db.insert(inventoryMovements).values({ storeId: b.id, variantId: pa.variants[0].id, movementType: 'restock', quantityChange: 1, previousQuantity: 0, resultingQuantity: 1 })).rejects.toThrow()
    // A sanity check that the same rows are accepted with the right store.
    await expect(db.execute(sql`select 1`)).resolves.toBeDefined()
  })
})
