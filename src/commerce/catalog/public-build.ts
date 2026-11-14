import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { categories, inventory, productCategories, productImages, products, productVariants } from '../../server/db/schema'
import { atomic } from '../../server/db/atomic'
import type { Db } from '../../server/db/types'
import { catalogImageUrl } from './image-url'
import type { Availability, ProductAvailability, PublicCatalog, PublicProduct } from './public'

/**
 * Reads the public catalogue of one store from the database.
 *
 * All reads run in one transaction (a single Neon HTTP batch), so the result is a consistent
 * snapshot even while the admin is saving. Only active products, active variants and visible
 * categories are included; archived and draft items never appear. Stock is reduced to an
 * availability status (in stock / low / out), so exact quantities are not published.
 */
export async function buildPublicCatalog(db: Db, store: { id: string; code: string; defaultCurrency: string }): Promise<{ catalog: PublicCatalog; mediaKeys: string[] }> {
  const storeId = store.id
  const liveProduct = and(eq(products.storeId, storeId), eq(products.status, 'active'), isNull(products.archivedAt))
  const [nowRows, productRows, variantRows, imageRows, categoryRows, linkRows] = (await atomic(db, [
    db.execute(sql`select now() as now`),
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        shortDescription: products.shortDescription,
        description: products.fullDescription,
        brand: products.brand,
        productType: products.productType,
        featured: products.featured,
        details: products.details,
        seoTitle: products.seoTitle,
        seoDescription: products.seoDescription,
      })
      .from(products)
      .where(liveProduct)
      .orderBy(desc(products.featured), asc(products.createdAt), asc(products.name)),
    db
      .select({
        productId: productVariants.productId,
        sku: productVariants.sku,
        title: productVariants.title,
        options: productVariants.options,
        priceMinor: productVariants.priceMinor,
        salePriceMinor: productVariants.salePriceMinor,
        currency: productVariants.currency,
        available: inventory.availableQuantity,
        reserved: inventory.reservedQuantity,
        threshold: inventory.lowStockThreshold,
      })
      .from(productVariants)
      .innerJoin(products, and(eq(products.id, productVariants.productId), liveProduct))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(productVariants.storeId, storeId), eq(productVariants.status, 'active'), isNull(productVariants.archivedAt)))
      .orderBy(asc(productVariants.position), asc(productVariants.createdAt)),
    db
      .select({ productId: productImages.productId, source: productImages.source, storageKey: productImages.storageKey, altText: productImages.altText, width: productImages.width, height: productImages.height })
      .from(productImages)
      .innerJoin(products, and(eq(products.id, productImages.productId), liveProduct))
      .where(eq(productImages.storeId, storeId))
      .orderBy(desc(productImages.isPrimary), asc(productImages.position)),
    db
      .select({ id: categories.id, slug: categories.slug, name: categories.name, description: categories.description, parentId: categories.parentId, position: categories.position, imageRef: categories.imageRef })
      .from(categories)
      .where(and(eq(categories.storeId, storeId), eq(categories.status, 'active'), isNull(categories.archivedAt)))
      .orderBy(asc(categories.position), asc(categories.name)),
    db
      .select({ productId: productCategories.productId, categoryId: productCategories.categoryId })
      .from(productCategories)
      .innerJoin(products, and(eq(products.id, productCategories.productId), liveProduct))
      .where(eq(productCategories.storeId, storeId))
      .orderBy(asc(productCategories.position)),
  ])) as [unknown, ProductRow[], VariantRow[], ImageRow[], CategoryRow[], { productId: string; categoryId: string }[]]

  const generatedAt = new Date(rowsOf<{ now: string | Date }>(nowRows)[0].now).toISOString()
  const categoryById = new Map(categoryRows.map((c) => [c.id, c]))
  const group = <T extends { productId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>()
    for (const r of rows) m.set(r.productId, [...(m.get(r.productId) ?? []), r])
    return m
  }
  const variantsBy = group(variantRows)
  const imagesBy = group(imageRows)
  const linksBy = group(linkRows)
  const mediaKeys: string[] = []

  const out: PublicProduct[] = productRows.map((p) => {
    const variants = (variantsBy.get(p.id) ?? []).map((v) => ({
      sku: v.sku,
      title: v.title,
      options: v.options ?? {},
      priceMinor: v.priceMinor,
      salePriceMinor: v.salePriceMinor,
      currency: v.currency,
      availability: availabilityOf(v.available, v.reserved, v.threshold),
    }))
    const images = (imagesBy.get(p.id) ?? []).map((i) => {
      if (i.source === 'object') mediaKeys.push(i.storageKey)
      return { url: catalogImageUrl(i.source, i.storageKey), alt: i.altText || `${p.name}`, width: i.width, height: i.height }
    })
    const cats = (linksBy.get(p.id) ?? []).map((l) => categoryById.get(l.categoryId)?.slug).filter((s): s is string => Boolean(s))
    return {
      slug: p.slug,
      name: p.name,
      shortDescription: p.shortDescription,
      description: p.description,
      brand: p.brand,
      productType: p.productType,
      featured: p.featured,
      categories: cats,
      notes: Array.isArray(p.details?.notes) ? p.details.notes : [],
      images,
      variants,
      availability: productAvailability(variants.map((v) => v.availability)),
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
    }
  })

  return {
    catalog: {
      schema: 1,
      store: store.code,
      currency: store.defaultCurrency,
      generatedAt,
      categories: categoryRows.map((c) => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        parent: c.parentId ? (categoryById.get(c.parentId)?.slug ?? null) : null,
        position: c.position,
        imageUrl: c.imageRef ? (c.imageRef.startsWith('/') ? c.imageRef : null) : null,
      })),
      products: out,
    },
    mediaKeys,
  }
}

/** Sellable quantity = available − reserved, never below zero. "Low" when at or under a non-zero threshold. */
export function availabilityOf(available: number | null, reserved: number | null, threshold: number | null): Availability {
  const sellable = Math.max(0, (available ?? 0) - (reserved ?? 0))
  if (sellable === 0) return 'out_of_stock'
  if ((threshold ?? 0) > 0 && sellable <= (threshold ?? 0)) return 'low_stock'
  return 'in_stock'
}

export function productAvailability(variants: Availability[]): ProductAvailability {
  if (!variants.length) return 'coming_soon'
  if (variants.includes('in_stock')) return 'in_stock'
  if (variants.includes('low_stock')) return 'low_stock'
  return 'out_of_stock'
}

function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows: T[] }).rows ?? [])
}

type ProductRow = {
  id: string
  slug: string
  name: string
  shortDescription: string | null
  description: string | null
  brand: string | null
  productType: string
  featured: boolean
  details: { notes?: { tier: string; notes: string[] }[] }
  seoTitle: string | null
  seoDescription: string | null
}
type VariantRow = { productId: string; sku: string; title: string; options: Record<string, string>; priceMinor: number; salePriceMinor: number | null; currency: string; available: number | null; reserved: number | null; threshold: number | null }
type ImageRow = { productId: string; source: string; storageKey: string; altText: string; width: number | null; height: number | null }
type CategoryRow = { id: string; slug: string; name: string; description: string | null; parentId: string | null; position: number; imageRef: string | null }

