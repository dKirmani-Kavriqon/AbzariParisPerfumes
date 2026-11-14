import { and, asc, count, desc, eq, exists, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import { categories, inventory, productCategories, productImages, products, productVariants } from '../../server/db/schema'
import { atomic } from '../../server/db/atomic'
import { withDbErrors } from '../../server/db/errors'
import type { Db } from '../../server/db/types'
import { conflict, notFound, validationFailed } from '../../server/http/errors'
import { assertAssignableCategories } from './categories'
import { slugify } from './slug'
import type { StoreContext } from './store'
import type { CreateProductInput, ProductListQuery, UpdateProductInput } from './validation'
import { assertSkusAvailable, variantInserts, variantWithStock } from './variants'

export type ProductRow = typeof products.$inferSelect

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
// Drizzle prints a bare "id" for columns of the main table, which is ambiguous inside the
// correlated subqueries below, so the product id is referenced with its table name.
const productIdRef = sql.raw('"products"."id"')

const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/**
 * Lists products with a summary of their variants (price range, stock) and primary image.
 * `status: 'current'` (default) means draft + active; archived products are only shown on request.
 */
export async function listProducts(db: Db, storeId: string, query: ProductListQuery) {
  const conditions: SQL[] = [eq(products.storeId, storeId)]
  if (query.status === 'current') conditions.push(isNull(products.archivedAt))
  else if (query.status !== 'all') conditions.push(eq(products.status, query.status))
  if (query.featured !== undefined) conditions.push(eq(products.featured, query.featured))
  if (query.categoryId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(productCategories)
          .where(and(eq(productCategories.storeId, storeId), eq(productCategories.productId, products.id), eq(productCategories.categoryId, query.categoryId))),
      ),
    )
  }
  if (query.q) {
    const p = likePattern(query.q)
    conditions.push(
      or(
        ilike(products.name, p),
        ilike(products.slug, p),
        ilike(products.brand, p),
        exists(
          db
            .select({ one: sql`1` })
            .from(productVariants)
            .where(and(eq(productVariants.storeId, storeId), eq(productVariants.productId, products.id), ilike(productVariants.sku, p))),
        ),
      )!,
    )
  }
  const where = and(...conditions)

  const [{ total }] = await db.select({ total: count() }).from(products).where(where)
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      brand: products.brand,
      productType: products.productType,
      status: products.status,
      featured: products.featured,
      updatedAt: products.updatedAt,
      archivedAt: products.archivedAt,
      variantCount: sql<number>`(select count(*)::int from ${productVariants} v where v.product_id = ${productIdRef} and v.archived_at is null)`,
      minPriceMinor: sql<number | null>`(select min(coalesce(v.sale_price_minor, v.price_minor))::int from ${productVariants} v where v.product_id = ${productIdRef} and v.archived_at is null)`,
      currency: sql<string | null>`(select min(v.currency) from ${productVariants} v where v.product_id = ${productIdRef} and v.archived_at is null)`,
      totalStock: sql<number>`(select coalesce(sum(i.available_quantity), 0)::int from ${inventory} i join ${productVariants} v on v.id = i.variant_id where v.product_id = ${productIdRef} and v.archived_at is null)`,
      primaryImage: sql<string | null>`(select pi.source || ':' || pi.storage_key from ${productImages} pi where pi.product_id = ${productIdRef} order by pi.is_primary desc, pi.position asc limit 1)`,
    })
    .from(products)
    .where(where)
    .orderBy(desc(products.featured), asc(products.name))
    .limit(query.limit)
    .offset(query.offset)
  return { items: rows, total, limit: query.limit, offset: query.offset }
}

export async function getProductRow(db: Db, storeId: string, id: string) {
  const [row] = await db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.id, id))).limit(1)
  if (!row) throw notFound('Product not found.')
  return row
}

/** A product with its categories, variants (with stock) and images. */
export async function getProduct(db: Db, storeId: string, id: string) {
  const product = await getProductRow(db, storeId, id)
  const [cats, variants, images] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId })
      .from(productCategories)
      .innerJoin(categories, and(eq(categories.id, productCategories.categoryId), eq(categories.storeId, storeId)))
      .where(and(eq(productCategories.storeId, storeId), eq(productCategories.productId, id)))
      .orderBy(asc(productCategories.position)),
    db
      .select(variantWithStock)
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(productVariants.storeId, storeId), eq(productVariants.productId, id)))
      .orderBy(asc(productVariants.position), asc(productVariants.createdAt)),
    db
      .select()
      .from(productImages)
      .where(and(eq(productImages.storeId, storeId), eq(productImages.productId, id)))
      .orderBy(desc(productImages.isPrimary), asc(productImages.position)),
  ])
  return { ...product, categories: cats, variants, images }
}

async function assertSlugFree(db: Db, storeId: string, slug: string, exceptId?: string) {
  const where = exceptId
    ? and(eq(products.storeId, storeId), eq(products.slug, slug), ne(products.id, exceptId))
    : and(eq(products.storeId, storeId), eq(products.slug, slug))
  const [hit] = await db.select({ id: products.id }).from(products).where(where).limit(1)
  if (hit) throw conflict('Another product already uses this slug.', { slug: 'Another product already uses this slug.' })
}

/**
 * Creates a product together with its category links, variants and stock records in one
 * transaction: if any part fails (for example a duplicate SKU), nothing is saved.
 */
export async function createProduct(db: Db, store: StoreContext, input: CreateProductInput, actor: string | null) {
  const slug = input.slug ?? slugify(input.name)
  if (!slug) throw validationFailed({ slug: 'Enter a slug.' })
  await assertSlugFree(db, store.id, slug)
  await assertAssignableCategories(db, store.id, input.categoryIds)
  await assertSkusAvailable(db, store.id, input.variants.map((v) => v.sku))

  const id = crypto.randomUUID()
  const productInsert = db.insert(products).values({
    id,
    storeId: store.id,
    name: input.name,
    slug,
    shortDescription: input.shortDescription,
    fullDescription: input.fullDescription,
    brand: input.brand,
    productType: input.productType,
    status: input.status,
    featured: input.featured,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    details: input.details,
  })
  const links = input.categoryIds.map((categoryId, position) => db.insert(productCategories).values({ storeId: store.id, productId: id, categoryId, position }))
  const { statements } = variantInserts(db, store.id, id, input.variants, store.defaultCurrency, actor)
  await withDbErrors(() => atomic(db, [productInsert, ...links, ...statements] as never))
  return getProduct(db, store.id, id)
}

export async function updateProduct(db: Db, storeId: string, id: string, patch: UpdateProductInput) {
  const current = await getProductRow(db, storeId, id)
  if (current.archivedAt) throw conflict('Restore the product before editing it.')
  if (patch.slug && patch.slug !== current.slug) await assertSlugFree(db, storeId, patch.slug, id)
  await withDbErrors(() =>
    db
      .update(products)
      .set(patch)
      .where(and(eq(products.storeId, storeId), eq(products.id, id))),
  )
  return getProduct(db, storeId, id)
}

/** Archives a product. Its rows stay (future orders may reference its variants); it just stops being current. */
export async function archiveProduct(db: Db, storeId: string, id: string) {
  const current = await getProductRow(db, storeId, id)
  if (current.archivedAt) return getProduct(db, storeId, id)
  await db
    .update(products)
    .set({ status: 'archived', archivedAt: new Date(), featured: false })
    .where(and(eq(products.storeId, storeId), eq(products.id, id), isNull(products.archivedAt)))
  return getProduct(db, storeId, id)
}

/** Brings an archived product back as a draft, so it is reviewed before going live again. */
export async function restoreProduct(db: Db, storeId: string, id: string) {
  await getProductRow(db, storeId, id)
  await db
    .update(products)
    .set({ status: 'draft', archivedAt: null })
    .where(and(eq(products.storeId, storeId), eq(products.id, id), isNotNull(products.archivedAt)))
  return getProduct(db, storeId, id)
}

/** Replaces a product's categories (in the given order) in one transaction. */
export async function setProductCategories(db: Db, storeId: string, productId: string, categoryIds: string[]) {
  const current = await getProductRow(db, storeId, productId)
  if (current.archivedAt) throw conflict('Restore the product before editing it.')
  await assertAssignableCategories(db, storeId, categoryIds)
  const clear = db.delete(productCategories).where(and(eq(productCategories.storeId, storeId), eq(productCategories.productId, productId)))
  const inserts = categoryIds.map((categoryId, position) => db.insert(productCategories).values({ storeId, productId, categoryId, position }))
  await withDbErrors(() => atomic(db, [clear, ...inserts] as never))
  return getProduct(db, storeId, productId)
}

/** Ids of products in this store (used to validate references in bulk). */
export async function productIdsInStore(db: Db, storeId: string, ids: string[]) {
  if (!ids.length) return new Set<string>()
  const rows = await db.select({ id: products.id }).from(products).where(and(eq(products.storeId, storeId), inArray(products.id, ids)))
  return new Set(rows.map((r) => r.id))
}
