'use client'

import { useMemo } from 'react'
import { CART_MAX_QUANTITY, type CartQuoteLine } from '../commerce/cart/cart'
import type { PublicCatalog } from '../commerce/catalog/public'
import { useCatalog } from './catalog'
import { quoteIsCurrent, useCart } from './cart'

export type CartRow = {
  sku: string
  quantity: number
  /** The server's answer for this SKU (prices, status). May describe an older quantity while a change is being checked. */
  line: CartQuoteLine | null
  /** The line describes exactly this quantity. */
  current: boolean
  name: string
  slug: string | null
  size: string
  image: { url: string; alt: string } | null
  maxQuantity: number
  /** The price shown last time, if it has changed since (display only). */
  previousPriceMinor: number | null
}

/** Names and photos for SKUs the server has not described yet, from the public catalogue. */
function describe(catalog: PublicCatalog, sku: string) {
  for (const p of catalog.products) {
    const v = p.variants.find((x) => x.sku === sku)
    if (v) return { name: p.name, slug: p.slug, size: v.title, image: p.images[0] ? { url: p.images[0].url, alt: p.images[0].alt } : null }
  }
  return null
}

/** Everything the bag and checkout screens show, derived from the bag, the quote and the catalogue. */
export function useCartView() {
  const cart = useCart()
  const { catalog } = useCatalog()
  const { items, quote, status, seen } = cart
  return useMemo(() => {
    const isCurrent = quoteIsCurrent(items, quote)
    const rows: CartRow[] = items.map((it) => {
      const line = quote?.lines.find((l) => l.sku === it.sku) ?? null
      const fallback = describe(catalog, it.sku)
      const p = line?.product
      const before = seen[it.sku]
      return {
        sku: it.sku,
        quantity: it.quantity,
        line,
        current: !!line && line.quantity === it.quantity,
        name: p?.name ?? fallback?.name ?? 'Item no longer available',
        slug: p?.slug ?? fallback?.slug ?? null,
        size: p?.variantTitle ?? fallback?.size ?? '',
        image: p?.image ?? fallback?.image ?? null,
        maxQuantity: line ? line.maxQuantity : CART_MAX_QUANTITY,
        previousPriceMinor: line?.unitPriceMinor != null && before != null && before !== line.unitPriceMinor ? before : null,
      }
    })
    const ready = isCurrent && status === 'ready'
    return {
      rows,
      currency: quote?.currency ?? catalog.currency,
      ready,
      subtotalMinor: ready ? quote.subtotalMinor : null,
      canCheckout: ready && quote.canCheckout,
      hasIssues: ready && !quote.canCheckout,
      checking: status === 'checking' || (items.length > 0 && !isCurrent && status !== 'error'),
    }
  }, [items, quote, status, seen, catalog])
}
