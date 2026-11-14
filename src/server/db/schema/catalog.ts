import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/*
 * Product catalogue and inventory.
 *
 * Isolation: every row carries store_id, and every child row points at its parent with a
 * composite (store_id, parent_id) foreign key. The database itself therefore refuses a
 * variant, image, category link or stock record that belongs to a different store than its
 * product, whatever the application code does. Services additionally filter every query by
 * store_id.
 *
 * Money is stored in integer minor units (paise for INR) with its ISO 4217 currency code.
 * Rows are archived, never deleted, so future orders can always point at them.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

export const SLUG_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$'
export const SKU_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'

export const productStatuses = ['draft', 'active', 'archived'] as const
export const categoryStatuses = ['active', 'hidden', 'archived'] as const
export const variantStatuses = ['active', 'inactive', 'archived'] as const
export const imageSources = ['static', 'object'] as const
export const movementTypes = ['initial', 'restock', 'return', 'damage', 'correction', 'sale', 'reservation', 'release'] as const

export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Matches `store.id` in src/config/store.ts for this deployment. */
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    defaultCurrency: char('default_currency', { length: 3 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('stores_code_format', sql`${t.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('stores_currency_format', sql`${t.defaultCurrency} ~ '^[A-Z]{3}$'`),
  ],
)

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    shortDescription: text('short_description'),
    fullDescription: text('full_description'),
    brand: text('brand'),
    productType: text('product_type').notNull().default('standard'),
    status: text('status', { enum: productStatuses }).notNull().default('draft'),
    featured: boolean('featured').notNull().default(false),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    unique('products_store_slug_unique').on(t.storeId, t.slug),
    unique('products_store_id_unique').on(t.storeId, t.id),
    index('products_store_status_idx').on(t.storeId, t.status, t.featured),
    index('products_store_created_idx').on(t.storeId, t.createdAt),
    check('products_name_length', sql`char_length(${t.name}) between 1 and 200`),
    check('products_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${t.slug}) <= 120`),
    check('products_status_values', sql`${t.status} in ('draft', 'active', 'archived')`),
    check('products_archived_consistent', sql`(${t.status} = 'archived') = (${t.archivedAt} is not null)`),
  ],
)

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    /** Adjacency list: nesting depth is limited in the service layer. */
    parentId: uuid('parent_id'),
    /** Static path ("/notes/oud.webp") or object-store key. */
    imageRef: text('image_ref'),
    status: text('status', { enum: categoryStatuses }).notNull().default('active'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    unique('categories_store_slug_unique').on(t.storeId, t.slug),
    unique('categories_store_id_unique').on(t.storeId, t.id),
    foreignKey({ name: 'categories_parent_same_store_fk', columns: [t.storeId, t.parentId], foreignColumns: [t.storeId, t.id] }).onDelete('restrict'),
    index('categories_store_parent_idx').on(t.storeId, t.parentId),
    check('categories_name_length', sql`char_length(${t.name}) between 1 and 120`),
    check('categories_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${t.slug}) <= 120`),
    check('categories_not_own_parent', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    check('categories_status_values', sql`${t.status} in ('active', 'hidden', 'archived')`),
    check('categories_archived_consistent', sql`(${t.status} = 'archived') = (${t.archivedAt} is not null)`),
  ],
)

export const productCategories = pgTable(
  'product_categories',
  {
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'product_categories_pk', columns: [t.productId, t.categoryId] }),
    foreignKey({ name: 'product_categories_product_fk', columns: [t.storeId, t.productId], foreignColumns: [products.storeId, products.id] }).onDelete('cascade'),
    foreignKey({ name: 'product_categories_category_fk', columns: [t.storeId, t.categoryId], foreignColumns: [categories.storeId, categories.id] }).onDelete('cascade'),
    index('product_categories_store_category_idx').on(t.storeId, t.categoryId),
  ],
)

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    sku: text('sku').notNull(),
    barcode: text('barcode'),
    /** Short label shown to customers, e.g. "50 ml". */
    title: text('title').notNull().default(''),
    /** Option name → value, e.g. { "Size": "50 ml" }. */
    options: jsonb('options').$type<Record<string, string>>().notNull().default({}),
    priceMinor: integer('price_minor').notNull(),
    salePriceMinor: integer('sale_price_minor'),
    currency: char('currency', { length: 3 }).notNull(),
    weightGrams: integer('weight_grams'),
    lengthMm: integer('length_mm'),
    widthMm: integer('width_mm'),
    heightMm: integer('height_mm'),
    status: text('status', { enum: variantStatuses }).notNull().default('active'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    // SKUs are never reused within a store, even after archiving, so stock history stays unambiguous.
    unique('product_variants_store_sku_unique').on(t.storeId, t.sku),
    unique('product_variants_store_id_unique').on(t.storeId, t.id),
    unique('product_variants_store_product_id_unique').on(t.storeId, t.productId, t.id),
    uniqueIndex('product_variants_store_barcode_unique').on(t.storeId, t.barcode).where(sql`${t.barcode} is not null`),
    foreignKey({ name: 'product_variants_product_fk', columns: [t.storeId, t.productId], foreignColumns: [products.storeId, products.id] }).onDelete('restrict'),
    index('product_variants_product_idx').on(t.productId),
    check('product_variants_sku_format', sql`${t.sku} ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'`),
    check('product_variants_price_non_negative', sql`${t.priceMinor} >= 0`),
    check('product_variants_sale_below_price', sql`${t.salePriceMinor} is null or (${t.salePriceMinor} >= 0 and ${t.salePriceMinor} < ${t.priceMinor})`),
    check('product_variants_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('product_variants_weight_non_negative', sql`${t.weightGrams} is null or ${t.weightGrams} >= 0`),
    check('product_variants_dimensions_positive', sql`coalesce(${t.lengthMm}, 1) > 0 and coalesce(${t.widthMm}, 1) > 0 and coalesce(${t.heightMm}, 1) > 0`),
    check('product_variants_status_values', sql`${t.status} in ('active', 'inactive', 'archived')`),
    check('product_variants_archived_consistent', sql`(${t.status} = 'archived') = (${t.archivedAt} is not null)`),
  ],
)

export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id'),
    /** 'static': a file shipped with the site under /public. 'object': a key in the object store (R2). */
    source: text('source', { enum: imageSources }).notNull(),
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type'),
    byteSize: integer('byte_size'),
    width: integer('width'),
    height: integer('height'),
    altText: text('alt_text').notNull().default(''),
    position: integer('position').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ name: 'product_images_product_fk', columns: [t.storeId, t.productId], foreignColumns: [products.storeId, products.id] }).onDelete('cascade'),
    // A variant image must belong to a variant of the same product in the same store. Variants are archived,
    // never deleted, so no ON DELETE action is needed. (Rows with variant_id null skip the check.)
    foreignKey({
      name: 'product_images_variant_fk',
      columns: [t.storeId, t.productId, t.variantId],
      foreignColumns: [productVariants.storeId, productVariants.productId, productVariants.id],
    }),
    uniqueIndex('product_images_one_primary').on(t.productId).where(sql`${t.isPrimary}`),
    unique('product_images_store_key_unique').on(t.storeId, t.storageKey),
    index('product_images_product_position_idx').on(t.productId, t.position),
    check('product_images_source_values', sql`${t.source} in ('static', 'object')`),
    check('product_images_alt_length', sql`char_length(${t.altText}) <= 250`),
    check('product_images_size_positive', sql`${t.byteSize} is null or ${t.byteSize} > 0`),
  ],
)

export const inventory = pgTable(
  'inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull(),
    variantId: uuid('variant_id').notNull().unique(),
    availableQuantity: integer('available_quantity').notNull().default(0),
    reservedQuantity: integer('reserved_quantity').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ name: 'inventory_variant_fk', columns: [t.storeId, t.variantId], foreignColumns: [productVariants.storeId, productVariants.id] }).onDelete('restrict'),
    index('inventory_store_idx').on(t.storeId),
    // The last line of defence against overselling: stock can never go below zero.
    check('inventory_available_non_negative', sql`${t.availableQuantity} >= 0`),
    check('inventory_reserved_non_negative', sql`${t.reservedQuantity} >= 0`),
    check('inventory_threshold_non_negative', sql`${t.lowStockThreshold} >= 0`),
  ],
)

/** Append-only stock ledger. A trigger (migration 0001) rejects UPDATE and DELETE. */
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    movementType: text('movement_type', { enum: movementTypes }).notNull(),
    quantityChange: integer('quantity_change').notNull(),
    previousQuantity: integer('previous_quantity').notNull(),
    resultingQuantity: integer('resulting_quantity').notNull(),
    reason: text('reason'),
    /** External reference, e.g. a supplier invoice or (later) an order number. */
    reference: text('reference'),
    /** Who made the change (admin email), when known. */
    actor: text('actor'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ name: 'inventory_movements_variant_fk', columns: [t.storeId, t.variantId], foreignColumns: [productVariants.storeId, productVariants.id] }).onDelete('restrict'),
    index('inventory_movements_variant_created_idx').on(t.variantId, t.createdAt),
    index('inventory_movements_store_created_idx').on(t.storeId, t.createdAt),
    check('inventory_movements_type_values', sql`${t.movementType} in ('initial', 'restock', 'return', 'damage', 'correction', 'sale', 'reservation', 'release')`),
    check('inventory_movements_quantities_non_negative', sql`${t.previousQuantity} >= 0 and ${t.resultingQuantity} >= 0`),
    check('inventory_movements_arithmetic', sql`${t.resultingQuantity} = ${t.previousQuantity} + ${t.quantityChange}`),
  ],
)
