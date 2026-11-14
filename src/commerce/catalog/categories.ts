import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm'
import { categories, productCategories, products } from '../../server/db/schema'
import type { Db } from '../../server/db/types'
import { withDbErrors } from '../../server/db/errors'
import { conflict, notFound, validationFailed } from '../../server/http/errors'
import { slugify } from './slug'
import type { CreateCategoryInput, UpdateCategoryInput } from './validation'

/** Categories nest at most this many levels deep (e.g. Fragrance › Eau de Parfum › Oud). */
export const MAX_CATEGORY_DEPTH = 4

export type CategoryRow = typeof categories.$inferSelect

export async function listCategories(db: Db, storeId: string, opts: { includeArchived?: boolean } = {}) {
  const where = opts.includeArchived ? eq(categories.storeId, storeId) : and(eq(categories.storeId, storeId), isNull(categories.archivedAt))
  const rows = await db.select().from(categories).where(where).orderBy(asc(categories.position), asc(categories.name))
  const counts = await db
    .select({ categoryId: productCategories.categoryId, n: count() })
    .from(productCategories)
    .innerJoin(products, and(eq(products.id, productCategories.productId), isNull(products.archivedAt)))
    .where(eq(productCategories.storeId, storeId))
    .groupBy(productCategories.categoryId)
  const byId = new Map(counts.map((c) => [c.categoryId, c.n]))
  return rows.map((r) => ({ ...r, productCount: byId.get(r.id) ?? 0 }))
}

export async function getCategory(db: Db, storeId: string, id: string) {
  const [row] = await db.select().from(categories).where(and(eq(categories.storeId, storeId), eq(categories.id, id))).limit(1)
  if (!row) throw notFound('Category not found.')
  return row
}

async function assertSlugFree(db: Db, storeId: string, slug: string, exceptId?: string) {
  const where = exceptId
    ? and(eq(categories.storeId, storeId), eq(categories.slug, slug), ne(categories.id, exceptId))
    : and(eq(categories.storeId, storeId), eq(categories.slug, slug))
  const [hit] = await db.select({ id: categories.id }).from(categories).where(where).limit(1)
  if (hit) throw conflict('Another category already uses this slug.', { slug: 'Another category already uses this slug.' })
}

/**
 * Checks a proposed parent: it must exist in this store, not be archived, not be the category
 * itself or one of its descendants (no loops), and keep the tree within MAX_CATEGORY_DEPTH.
 */
async function assertValidParent(db: Db, storeId: string, parentId: string, selfId?: string) {
  const all = await db.select({ id: categories.id, parentId: categories.parentId, archivedAt: categories.archivedAt }).from(categories).where(eq(categories.storeId, storeId))
  const byId = new Map(all.map((c) => [c.id, c]))
  const parent = byId.get(parentId)
  if (!parent) throw validationFailed({ parentId: 'The parent category does not exist in this store.' })
  if (parent.archivedAt) throw validationFailed({ parentId: 'The parent category is archived.' })

  let depth = 1
  for (let cur: string | null = parentId; cur; cur = byId.get(cur)?.parentId ?? null) {
    if (cur === selfId) throw validationFailed({ parentId: 'A category cannot be placed inside itself or its own subcategory.' })
    depth++
    if (depth > MAX_CATEGORY_DEPTH + 1) break
  }
  // Height of the subtree being moved (1 for a leaf or a new category).
  let height = 1
  if (selfId) {
    const childrenOf = (id: string) => all.filter((c) => c.parentId === id).map((c) => c.id)
    const walk = (id: string, h: number): number => Math.max(h, ...childrenOf(id).map((c) => walk(c, h + 1)))
    height = walk(selfId, 1)
  }
  if (depth - 1 + height > MAX_CATEGORY_DEPTH) throw validationFailed({ parentId: `Categories can nest at most ${MAX_CATEGORY_DEPTH} levels deep.` })
}

export async function createCategory(db: Db, storeId: string, input: CreateCategoryInput) {
  const slug = input.slug ?? slugify(input.name)
  if (!slug) throw validationFailed({ slug: 'Enter a slug.' })
  await assertSlugFree(db, storeId, slug)
  if (input.parentId) await assertValidParent(db, storeId, input.parentId)
  const [row] = await withDbErrors(() =>
    db
      .insert(categories)
      .values({ storeId, name: input.name, slug, description: input.description, parentId: input.parentId, imageRef: input.imageRef, status: input.status, position: input.position })
      .returning(),
  )
  return row
}

export async function updateCategory(db: Db, storeId: string, id: string, patch: UpdateCategoryInput) {
  const current = await getCategory(db, storeId, id)
  if (current.archivedAt) throw conflict('Restore the category before editing it.')
  if (patch.slug && patch.slug !== current.slug) await assertSlugFree(db, storeId, patch.slug, id)
  if (patch.parentId) await assertValidParent(db, storeId, patch.parentId, id)
  const [row] = await withDbErrors(() =>
    db
      .update(categories)
      .set(patch)
      .where(and(eq(categories.storeId, storeId), eq(categories.id, id)))
      .returning(),
  )
  return row
}

/** Archives a category. Refused while it still has subcategories that are not archived. */
export async function archiveCategory(db: Db, storeId: string, id: string) {
  const current = await getCategory(db, storeId, id)
  if (current.archivedAt) return current
  const [child] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.storeId, storeId), eq(categories.parentId, id), isNull(categories.archivedAt)))
    .limit(1)
  if (child) throw conflict('Archive or move its subcategories first.')
  const [row] = await db
    .update(categories)
    .set({ status: 'archived', archivedAt: new Date() })
    .where(and(eq(categories.storeId, storeId), eq(categories.id, id)))
    .returning()
  return row
}

export async function restoreCategory(db: Db, storeId: string, id: string) {
  const current = await getCategory(db, storeId, id)
  if (!current.archivedAt) return current
  if (current.parentId) {
    const parent = await getCategory(db, storeId, current.parentId)
    if (parent.archivedAt) throw conflict('Restore its parent category first.')
  }
  const [row] = await db
    .update(categories)
    .set({ status: 'active', archivedAt: null })
    .where(and(eq(categories.storeId, storeId), eq(categories.id, id)))
    .returning()
  return row
}

/** Throws unless every id is a non-archived category of this store. */
export async function assertAssignableCategories(db: Db, storeId: string, ids: string[]) {
  if (ids.length === 0) return
  const found = await db
    .select({ id: categories.id, archivedAt: categories.archivedAt })
    .from(categories)
    .where(and(eq(categories.storeId, storeId), inArray(categories.id, ids)))
  const ok = new Set(found.filter((c) => !c.archivedAt).map((c) => c.id))
  const bad = ids.filter((i) => !ok.has(i))
  if (bad.length) throw validationFailed({ categoryIds: 'One or more categories do not exist in this store or are archived.' })
}
