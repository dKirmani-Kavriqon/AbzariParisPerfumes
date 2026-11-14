import { and, asc, desc, eq, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { inventory, inventoryMovements, products, productVariants } from '../../server/db/schema'
import type { Db } from '../../server/db/types'
import { AppError, notFound } from '../../server/http/errors'
import type { StockAdjustmentInput } from './validation'

export type MovementRow = typeof inventoryMovements.$inferSelect

/** Stock record of one variant, with its product for context. */
export async function getStock(db: Db, storeId: string, variantId: string) {
  const [row] = await db
    .select({
      variantId: inventory.variantId,
      sku: productVariants.sku,
      variantTitle: productVariants.title,
      productId: products.id,
      productName: products.name,
      availableQuantity: inventory.availableQuantity,
      reservedQuantity: inventory.reservedQuantity,
      lowStockThreshold: inventory.lowStockThreshold,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .innerJoin(productVariants, and(eq(productVariants.id, inventory.variantId), eq(productVariants.storeId, storeId)))
    .innerJoin(products, and(eq(products.id, productVariants.productId), eq(products.storeId, storeId)))
    .where(and(eq(inventory.storeId, storeId), eq(inventory.variantId, variantId)))
    .limit(1)
  if (!row) throw notFound('Variant not found.')
  return { ...row, isLow: row.availableQuantity <= row.lowStockThreshold }
}

/**
 * Changes a variant's available stock and records the movement, atomically.
 *
 * One SQL statement does both: the UPDATE only applies when the result stays at zero or
 * above, and the ledger row is inserted from the UPDATE's own result. Postgres locks the
 * stock row for the duration, so concurrent adjustments are applied one after another and
 * each ledger row's previous/resulting quantities are exact. The CHECK constraint on
 * inventory.available_quantity is a second guard against negative stock.
 */
export async function adjustStock(db: Db, storeId: string, variantId: string, input: StockAdjustmentInput, actor: string | null) {
  const delta = input.quantityChange
  type Row = { id: string; previous_quantity: number; resulting_quantity: number; created_at: string }
  // Both drivers (Neon HTTP, PGlite) return { rows } for raw statements.
  const result = (await db.execute(sql`
    with upd as (
      update ${inventory}
         set available_quantity = available_quantity + ${delta}::int, updated_at = now()
       where store_id = ${storeId}::uuid and variant_id = ${variantId}::uuid and available_quantity + ${delta}::int >= 0
      returning available_quantity
    )
    insert into ${inventoryMovements} (store_id, variant_id, movement_type, quantity_change, previous_quantity, resulting_quantity, reason, reference, actor)
    select ${storeId}::uuid, ${variantId}::uuid, ${input.type}, ${delta}::int, upd.available_quantity - ${delta}::int, upd.available_quantity, ${input.reason}, ${input.reference}, ${actor}
      from upd
    returning id, previous_quantity, resulting_quantity, created_at`)) as unknown as { rows: Row[] }
  const [row] = result.rows
  if (!row) {
    const stock = await getStock(db, storeId, variantId) // throws 404 if the variant is not in this store
    throw new AppError(409, 'conflict', `Only ${stock.availableQuantity} in stock, so it cannot go down by ${-delta}.`, {
      details: { quantityChange: 'Stock cannot go below zero.', availableQuantity: stock.availableQuantity },
    })
  }
  return {
    movementId: row.id,
    previousQuantity: Number(row.previous_quantity),
    resultingQuantity: Number(row.resulting_quantity),
    stock: await getStock(db, storeId, variantId),
  }
}

export async function setLowStockThreshold(db: Db, storeId: string, variantId: string, threshold: number) {
  const rows = await db
    .update(inventory)
    .set({ lowStockThreshold: threshold })
    .where(and(eq(inventory.storeId, storeId), eq(inventory.variantId, variantId)))
    .returning({ variantId: inventory.variantId })
  if (!rows.length) throw notFound('Variant not found.')
  return getStock(db, storeId, variantId)
}

/** Ledger entries for one variant, newest first. */
export async function listMovements(db: Db, storeId: string, variantId: string, limit = 50) {
  await getStock(db, storeId, variantId)
  return db
    .select()
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.storeId, storeId), eq(inventoryMovements.variantId, variantId)))
    .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
    .limit(Math.min(Math.max(limit, 1), 200))
}

/** Stock overview across current (non-archived) products and variants. */
export async function listInventory(db: Db, storeId: string, opts: { q?: string; lowStock?: boolean; limit: number; offset: number }) {
  const conditions: SQL[] = [eq(inventory.storeId, storeId), isNull(productVariants.archivedAt), isNull(products.archivedAt)]
  if (opts.lowStock) conditions.push(lte(inventory.availableQuantity, inventory.lowStockThreshold))
  if (opts.q) {
    const p = `%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    conditions.push(or(ilike(products.name, p), ilike(productVariants.sku, p))!)
  }
  const rows = await db
    .select({
      variantId: inventory.variantId,
      sku: productVariants.sku,
      variantTitle: productVariants.title,
      variantStatus: productVariants.status,
      productId: products.id,
      productName: products.name,
      productStatus: products.status,
      availableQuantity: inventory.availableQuantity,
      reservedQuantity: inventory.reservedQuantity,
      lowStockThreshold: inventory.lowStockThreshold,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .innerJoin(productVariants, and(eq(productVariants.id, inventory.variantId), eq(productVariants.storeId, storeId)))
    .innerJoin(products, and(eq(products.id, productVariants.productId), eq(products.storeId, storeId)))
    .where(and(...conditions))
    .orderBy(asc(products.name), asc(productVariants.position))
    .limit(opts.limit)
    .offset(opts.offset)
  return rows.map((r) => ({ ...r, isLow: r.availableQuantity <= r.lowStockThreshold }))
}
