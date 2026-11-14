import { and, asc, desc, eq, max, ne, sql } from 'drizzle-orm'
import { productImages, productVariants } from '../../server/db/schema'
import { atomic } from '../../server/db/atomic'
import { withDbErrors } from '../../server/db/errors'
import type { Db } from '../../server/db/types'
import { conflict, notFound, validationFailed } from '../../server/http/errors'
import { getProductRow } from './products'

export type ImageRow = typeof productImages.$inferSelect

export async function listImages(db: Db, storeId: string, productId: string) {
  await getProductRow(db, storeId, productId)
  return db
    .select()
    .from(productImages)
    .where(and(eq(productImages.storeId, storeId), eq(productImages.productId, productId)))
    .orderBy(desc(productImages.isPrimary), asc(productImages.position))
}

export async function getImage(db: Db, storeId: string, imageId: string) {
  const [row] = await db.select().from(productImages).where(and(eq(productImages.storeId, storeId), eq(productImages.id, imageId))).limit(1)
  if (!row) throw notFound('Image not found.')
  return row
}

async function assertVariantOfProduct(db: Db, storeId: string, productId: string, variantId: string) {
  const [v] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.storeId, storeId), eq(productVariants.productId, productId), eq(productVariants.id, variantId)))
    .limit(1)
  if (!v) throw validationFailed({ variantId: 'The variant does not belong to this product.' })
}

export type NewImage = {
  source: 'static' | 'object'
  storageKey: string
  contentType?: string | null
  byteSize?: number | null
  width?: number | null
  height?: number | null
  altText?: string
  variantId?: string | null
}

/** Attaches an image to a product, after the last one. The first image becomes the primary image. */
export async function addImage(db: Db, storeId: string, productId: string, image: NewImage) {
  const product = await getProductRow(db, storeId, productId)
  if (product.archivedAt) throw conflict('Restore the product before editing it.')
  if (image.variantId) await assertVariantOfProduct(db, storeId, productId, image.variantId)
  const [{ last, hasPrimary }] = await db
    .select({ last: max(productImages.position), hasPrimary: sql<boolean | null>`bool_or(${productImages.isPrimary})` })
    .from(productImages)
    .where(eq(productImages.productId, productId))
  const isFirst = last === null
  const [row] = await withDbErrors(() =>
    db
      .insert(productImages)
      .values({
        storeId,
        productId,
        variantId: image.variantId ?? null,
        source: image.source,
        storageKey: image.storageKey,
        contentType: image.contentType ?? null,
        byteSize: image.byteSize ?? null,
        width: image.width ?? null,
        height: image.height ?? null,
        altText: image.altText ?? '',
        position: isFirst ? 0 : (last as number) + 1,
        isPrimary: isFirst || !hasPrimary,
      })
      .returning(),
  )
  return row
}

export async function updateImage(db: Db, storeId: string, imageId: string, patch: { altText?: string; variantId?: string | null }) {
  const image = await getImage(db, storeId, imageId)
  if (patch.variantId) await assertVariantOfProduct(db, storeId, image.productId, patch.variantId)
  const [row] = await withDbErrors(() =>
    db
      .update(productImages)
      .set(patch)
      .where(and(eq(productImages.storeId, storeId), eq(productImages.id, imageId)))
      .returning(),
  )
  return row
}

/** Makes one image the primary image (and only that one), in one transaction. */
export async function setPrimaryImage(db: Db, storeId: string, imageId: string) {
  const image = await getImage(db, storeId, imageId)
  if (image.isPrimary) return image
  await atomic(db, [
    db
      .update(productImages)
      .set({ isPrimary: false })
      .where(and(eq(productImages.storeId, storeId), eq(productImages.productId, image.productId), ne(productImages.id, imageId))),
    db
      .update(productImages)
      .set({ isPrimary: true })
      .where(and(eq(productImages.storeId, storeId), eq(productImages.id, imageId))),
  ])
  return getImage(db, storeId, imageId)
}

/** Sets the display order. `imageIds` must list every image of the product exactly once. */
export async function reorderImages(db: Db, storeId: string, productId: string, imageIds: string[]) {
  const current = await listImages(db, storeId, productId)
  const have = new Set(current.map((i) => i.id))
  if (imageIds.length !== have.size || imageIds.some((id) => !have.has(id))) {
    throw validationFailed({ imageIds: 'List every image of this product exactly once.' })
  }
  const updates = imageIds.map((id, position) =>
    db
      .update(productImages)
      .set({ position })
      .where(and(eq(productImages.storeId, storeId), eq(productImages.productId, productId), eq(productImages.id, id))),
  )
  await atomic(db, updates as never)
  return listImages(db, storeId, productId)
}

/**
 * Removes an image record and returns it, so the caller can delete the stored file afterwards.
 * If it was the primary image, the next image in order becomes primary (same transaction).
 */
export async function deleteImage(db: Db, storeId: string, imageId: string) {
  const image = await getImage(db, storeId, imageId)
  const del = db.delete(productImages).where(and(eq(productImages.storeId, storeId), eq(productImages.id, imageId)))
  if (!image.isPrimary) {
    await del
    return image
  }
  const [next] = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(and(eq(productImages.productId, image.productId), ne(productImages.id, imageId)))
    .orderBy(asc(productImages.position))
    .limit(1)
  if (next) await atomic(db, [del, db.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, next.id))])
  else await del
  return image
}
