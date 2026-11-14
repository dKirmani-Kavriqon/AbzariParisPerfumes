import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { inventory, productImages, products, productVariants } from '../../server/db/schema'
import { atomic } from '../../server/db/atomic'
import type { Db } from '../../server/db/types'
import { catalogImageUrl } from '../catalog/image-url'
import { CART_MAX_QUANTITY, mergeItems, type CartItem, type CartQuote, type CartQuoteLine } from './cart'

type Store = { id: string; defaultCurrency: string }

/**
 * Prices and checks a cart against the database. This is the only place cart prices come from.
 *
 * - Input is SKUs and quantities only. The store comes from the server, never from the request,
 *   and every lookup is filtered by it, so another store's SKUs simply are not found.
 * - Prices are read now (sale price when set) and multiplied in integer minor units.
 * - Stock is read now: sellable = available − reserved. Nothing is reserved or deducted here, and
 *   an "ok" line is not a promise: final checks and reservation happen at checkout.
 * - Unknown, draft, archived and withdrawn items all answer "unavailable" with no details, so the
 *   cart cannot be used to discover unpublished products.
 *
 * One database round trip (a single batch) whatever the cart size.
 */
export async function quoteCart(db: Db, store: Store, input: CartItem[], now = new Date()): Promise<CartQuote> {
  const items = mergeItems(input)
  if (!items.length) return { currency: store.defaultCurrency, lines: [], subtotalMinor: 0, itemCount: 0, canCheckout: false, checkedAt: now.toISOString() }
  const skus = items.map((i) => i.sku)

  const [variantRows, imageRows] = (await atomic(db, [
    db
      .select({
        sku: productVariants.sku,
        productId: productVariants.productId,
        variantStatus: productVariants.status,
        variantArchivedAt: productVariants.archivedAt,
        title: productVariants.title,
        priceMinor: productVariants.priceMinor,
        salePriceMinor: productVariants.salePriceMinor,
        currency: productVariants.currency,
        productStatus: products.status,
        productArchivedAt: products.archivedAt,
        slug: products.slug,
        name: products.name,
        available: inventory.availableQuantity,
        reserved: inventory.reservedQuantity,
      })
      .from(productVariants)
      .innerJoin(products, and(eq(products.id, productVariants.productId), eq(products.storeId, store.id)))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(productVariants.storeId, store.id), inArray(productVariants.sku, skus))),
    db
      .select({ productId: productImages.productId, source: productImages.source, storageKey: productImages.storageKey, altText: productImages.altText })
      .from(productImages)
      .innerJoin(productVariants, and(eq(productVariants.productId, productImages.productId), eq(productVariants.storeId, store.id), inArray(productVariants.sku, skus)))
      .where(eq(productImages.storeId, store.id))
      .orderBy(desc(productImages.isPrimary), asc(productImages.position)),
  ])) as [VariantRow[], ImageRow[]]

  const bySku = new Map(variantRows.map((r) => [r.sku, r]))
  const imageBy = new Map<string, ImageRow>()
  for (const img of imageRows) if (!imageBy.has(img.productId)) imageBy.set(img.productId, img)

  const lines: CartQuoteLine[] = items.map(({ sku, quantity }) => {
    const r = bySku.get(sku)
    const live =
      r &&
      r.productStatus === 'active' &&
      !r.productArchivedAt &&
      r.variantStatus === 'active' &&
      !r.variantArchivedAt &&
      r.currency === store.defaultCurrency
    if (!r || !live) return { sku, quantity, status: 'unavailable', maxQuantity: 0, product: null, unitPriceMinor: null, compareAtMinor: null, lineTotalMinor: null }

    const sellable = Math.max(0, (r.available ?? 0) - (r.reserved ?? 0))
    const maxQuantity = Math.min(sellable, CART_MAX_QUANTITY)
    const unit = r.salePriceMinor ?? r.priceMinor
    const img = imageBy.get(r.productId)
    return {
      sku,
      quantity,
      status: sellable === 0 ? 'sold_out' : quantity > sellable ? 'insufficient_stock' : 'ok',
      maxQuantity,
      product: { slug: r.slug, name: r.name, variantTitle: r.title, image: img ? { url: catalogImageUrl(img.source, img.storageKey), alt: img.altText || r.name } : null },
      unitPriceMinor: unit,
      compareAtMinor: r.salePriceMinor != null ? r.priceMinor : null,
      lineTotalMinor: unit * quantity,
    }
  })

  const okLines = lines.filter((l) => l.status === 'ok')
  return {
    currency: store.defaultCurrency,
    lines,
    subtotalMinor: okLines.reduce((n, l) => n + (l.lineTotalMinor ?? 0), 0),
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    canCheckout: okLines.length === lines.length,
    checkedAt: now.toISOString(),
  }
}

type VariantRow = {
  sku: string
  productId: string
  variantStatus: string
  variantArchivedAt: Date | null
  title: string
  priceMinor: number
  salePriceMinor: number | null
  currency: string
  productStatus: string
  productArchivedAt: Date | null
  slug: string
  name: string
  available: number | null
  reserved: number | null
}
type ImageRow = { productId: string; source: string; storageKey: string; altText: string }
