import { and, asc, eq, ne } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { inventory, inventoryMovements, products, productVariants } from '../../server/db/schema'
import { atomic } from '../../server/db/atomic'
import { withDbErrors } from '../../server/db/errors'
import type { Db } from '../../server/db/types'
import { conflict, notFound, validationFailed } from '../../server/http/errors'
import type { CreateVariantInput, UpdateVariantInput } from './validation'

export type VariantRow = typeof productVariants.$inferSelect

/** Fields shared by every variant read: the variant plus its stock record. */
export const variantWithStock = {
  id: productVariants.id,
  productId: productVariants.productId,
  sku: productVariants.sku,
  barcode: productVariants.barcode,
  title: productVariants.title,
  options: productVariants.options,
  priceMinor: productVariants.priceMinor,
  salePriceMinor: productVariants.salePriceMinor,
  currency: productVariants.currency,
  weightGrams: productVariants.weightGrams,
  lengthMm: productVariants.lengthMm,
  widthMm: productVariants.widthMm,
  heightMm: productVariants.heightMm,
  status: productVariants.status,
  position: productVariants.position,
  createdAt: productVariants.createdAt,
  updatedAt: productVariants.updatedAt,
  archivedAt: productVariants.archivedAt,
  availableQuantity: inventory.availableQuantity,
  reservedQuantity: inventory.reservedQuantity,
  lowStockThreshold: inventory.lowStockThreshold,
}

/** Is this SKU free in the store? Optionally ignoring one variant (when editing it). */
export async function isSkuAvailable(db: Db, storeId: string, sku: string, exceptVariantId?: string) {
  const where = exceptVariantId
    ? and(eq(productVariants.storeId, storeId), eq(productVariants.sku, sku), ne(productVariants.id, exceptVariantId))
    : and(eq(productVariants.storeId, storeId), eq(productVariants.sku, sku))
  const [hit] = await db.select({ id: productVariants.id }).from(productVariants).where(where).limit(1)
  return !hit
}

/** Rejects SKUs repeated within one request or already used in the store. */
export async function assertSkusAvailable(db: Db, storeId: string, skus: string[]) {
  const seen = new Set<string>()
  for (const s of skus) {
    if (seen.has(s)) throw conflict(`The SKU ${s} is used twice.`, { sku: `The SKU ${s} is used twice.` })
    seen.add(s)
  }
  for (const s of skus) if (!(await isSkuAvailable(db, storeId, s))) throw conflict(`The SKU ${s} is already used in this store.`, { sku: `The SKU ${s} is already used in this store.` })
}

/**
 * Insert statements for new variants with their stock records (and an "initial" ledger entry
 * when they start with stock). Ids are generated here so the statements can run in one batch.
 */
export function variantInserts(db: Db, storeId: string, productId: string, inputs: CreateVariantInput[], defaultCurrency: string, actor: string | null, startPosition = 0) {
  const statements: BatchItem<'pg'>[] = []
  const ids: string[] = []
  inputs.forEach((v, i) => {
    const id = crypto.randomUUID()
    ids.push(id)
    statements.push(
      db.insert(productVariants).values({
        id,
        storeId,
        productId,
        sku: v.sku,
        barcode: v.barcode,
        title: v.title,
        options: v.options,
        priceMinor: v.priceMinor,
        salePriceMinor: v.salePriceMinor,
        currency: v.currency ?? defaultCurrency,
        weightGrams: v.weightGrams,
        lengthMm: v.lengthMm,
        widthMm: v.widthMm,
        heightMm: v.heightMm,
        status: v.status,
        position: startPosition + i,
      }),
      db.insert(inventory).values({ storeId, variantId: id, availableQuantity: v.initialStock, lowStockThreshold: v.lowStockThreshold }),
    )
    if (v.initialStock > 0) {
      statements.push(
        db.insert(inventoryMovements).values({
          storeId,
          variantId: id,
          movementType: 'initial',
          quantityChange: v.initialStock,
          previousQuantity: 0,
          resultingQuantity: v.initialStock,
          reason: 'Opening stock',
          actor,
        }),
      )
    }
  })
  return { statements, ids }
}

export async function listVariants(db: Db, storeId: string, productId: string) {
  await assertProductInStore(db, storeId, productId)
  return db
    .select(variantWithStock)
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(productVariants.storeId, storeId), eq(productVariants.productId, productId)))
    .orderBy(asc(productVariants.position), asc(productVariants.createdAt))
}

export async function getVariant(db: Db, storeId: string, variantId: string) {
  const [row] = await db
    .select(variantWithStock)
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(productVariants.storeId, storeId), eq(productVariants.id, variantId)))
    .limit(1)
  if (!row) throw notFound('Variant not found.')
  return row
}

async function assertProductInStore(db: Db, storeId: string, productId: string, opts: { mustBeCurrent?: boolean } = {}) {
  const [p] = await db.select({ id: products.id, archivedAt: products.archivedAt }).from(products).where(and(eq(products.storeId, storeId), eq(products.id, productId))).limit(1)
  if (!p) throw notFound('Product not found.')
  if (opts.mustBeCurrent && p.archivedAt) throw conflict('The product is archived.')
  return p
}

export async function createVariant(db: Db, store: { id: string; defaultCurrency: string }, productId: string, input: CreateVariantInput, actor: string | null) {
  await assertProductInStore(db, store.id, productId, { mustBeCurrent: true })
  await assertSkusAvailable(db, store.id, [input.sku])
  const existing = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId))
  const { statements, ids } = variantInserts(db, store.id, productId, [input], store.defaultCurrency, actor, existing.length)
  await withDbErrors(() => atomic(db, statements as never))
  return getVariant(db, store.id, ids[0])
}

export async function updateVariant(db: Db, storeId: string, variantId: string, patch: UpdateVariantInput) {
  const current = await getVariant(db, storeId, variantId)
  if (current.archivedAt) throw conflict('The variant is archived.')
  // Either price may change on its own, so check the rule against the merged values.
  const price = patch.priceMinor ?? current.priceMinor
  const sale = patch.salePriceMinor !== undefined ? patch.salePriceMinor : current.salePriceMinor
  if (sale != null && sale >= price) throw validationFailed({ salePriceMinor: 'The sale price must be lower than the regular price.' })
  if (patch.sku && patch.sku !== current.sku && !(await isSkuAvailable(db, storeId, patch.sku, variantId))) {
    throw conflict('This SKU is already used in this store.', { sku: 'This SKU is already used in this store.' })
  }
  await withDbErrors(() =>
    db
      .update(productVariants)
      .set(patch)
      .where(and(eq(productVariants.storeId, storeId), eq(productVariants.id, variantId))),
  )
  return getVariant(db, storeId, variantId)
}

/** Archives a variant: it stays in the database (and in stock history) but can no longer be sold. */
export async function archiveVariant(db: Db, storeId: string, variantId: string) {
  const current = await getVariant(db, storeId, variantId)
  if (current.archivedAt) return current
  await db
    .update(productVariants)
    .set({ status: 'archived', archivedAt: new Date() })
    .where(and(eq(productVariants.storeId, storeId), eq(productVariants.id, variantId)))
  return getVariant(db, storeId, variantId)
}
