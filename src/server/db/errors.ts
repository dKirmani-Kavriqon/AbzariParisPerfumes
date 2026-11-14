import { AppError } from '../http/errors'

type PgError = { code?: string; constraint?: string; constraint_name?: string }

/** Finds the Postgres error inside driver/ORM wrappers (Drizzle wraps driver errors in `cause`). */
export function pgErrorOf(error: unknown): PgError | undefined {
  let e: unknown = error
  for (let i = 0; i < 4 && e && typeof e === 'object'; i++) {
    const c = (e as PgError).code
    if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c)) return e as PgError
    e = (e as { cause?: unknown }).cause
  }
  return undefined
}

/** What a violated constraint means to the caller: the field it concerns and a safe message. */
const constraintMessages: Record<string, { status: number; field: string; message: string }> = {
  products_store_slug_unique: { status: 409, field: 'slug', message: 'Another product already uses this slug.' },
  categories_store_slug_unique: { status: 409, field: 'slug', message: 'Another category already uses this slug.' },
  product_variants_store_sku_unique: { status: 409, field: 'sku', message: 'This SKU is already used in this store.' },
  product_variants_store_barcode_unique: { status: 409, field: 'barcode', message: 'This barcode is already used in this store.' },
  product_variants_sale_below_price: { status: 422, field: 'salePriceMinor', message: 'The sale price must be lower than the regular price.' },
  product_categories_pk: { status: 409, field: 'categoryIds', message: 'The product is already in this category.' },
  product_categories_category_fk: { status: 422, field: 'categoryIds', message: 'A category does not exist in this store.' },
  product_images_variant_fk: { status: 422, field: 'variantId', message: 'The variant does not belong to this product.' },
  product_images_store_key_unique: { status: 409, field: 'image', message: 'This image is already attached.' },
  inventory_available_non_negative: { status: 409, field: 'quantityChange', message: 'Stock cannot go below zero.' },
  categories_parent_same_store_fk: { status: 422, field: 'parentId', message: 'The parent category does not exist in this store.' },
}

/**
 * Converts known constraint violations into AppErrors with a field and a safe message.
 * Returns the original error untouched when it is not one we recognise.
 */
export function mapDbError(error: unknown): unknown {
  const pg = pgErrorOf(error)
  if (!pg) return error
  const name = pg.constraint ?? pg.constraint_name
  const known = name ? constraintMessages[name] : undefined
  if (known) {
    const code = known.status === 409 ? 'conflict' : 'validation_failed'
    return new AppError(known.status, code, known.message, { details: { [known.field]: known.message }, cause: error })
  }
  if (pg.code === '23505') return new AppError(409, 'conflict', 'This conflicts with an existing record.', { cause: error })
  if (pg.code === '23503') return new AppError(422, 'validation_failed', 'A referenced record does not exist in this store.', { cause: error })
  if (pg.code === '23514') return new AppError(422, 'validation_failed', 'A value is not allowed.', { cause: error })
  return error
}

/** Runs a database call and rethrows constraint violations as AppErrors. */
export async function withDbErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw mapDbError(error)
  }
}
