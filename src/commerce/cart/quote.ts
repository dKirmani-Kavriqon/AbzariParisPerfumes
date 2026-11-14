import { sql } from 'drizzle-orm'
import type { Db } from '../../server/db/types'
import { serviceUnavailable } from '../../server/http/errors'
import { catalogImageUrl } from '../catalog/image-url'
import { CART_MAX_QUANTITY, mergeItems, type CartItem, type CartQuote, type CartQuoteLine } from './cart'

/**
 * Prices and checks a cart against the database. This is the only place cart prices come from.
 *
 * - Input is SKUs and quantities only. The store is this deployment's (from the server's
 *   config), never the request's, and every lookup is filtered by it, so another store's
 *   SKUs simply are not found.
 * - Prices are read now (sale price when set) and multiplied in integer minor units.
 * - Stock is read now: sellable = available − reserved. Nothing is reserved or deducted here, and
 *   an "ok" line is not a promise: final checks and reservation happen at checkout.
 * - Unknown, draft, archived and withdrawn items all answer "unavailable" with no details, so the
 *   cart cannot be used to discover unpublished products.
 *
 * One SQL statement (one round trip), which also finds the store, whatever the cart size: this
 * keeps the Worker well inside the free plan's CPU limit.
 */
export async function quoteCart(db: Db, store: { code: string; currency: string }, input: CartItem[], now = new Date()): Promise<CartQuote> {
  const items = mergeItems(input)
  // An empty bag needs no database (and does not wake it).
  if (!items.length) return { currency: store.currency, lines: [], subtotalMinor: 0, itemCount: 0, canCheckout: false, checkedAt: now.toISOString() }
  const skus = items.map((i) => i.sku)
  const result = (await db.execute(sql`
    with st as (select id, default_currency from stores where code = ${store.code})
    select st.default_currency as store_currency, x.*
      from st
      left join lateral (
        select v.sku, v.status as variant_status, v.archived_at as variant_archived_at, v.title,
               v.price_minor, v.sale_price_minor, v.currency,
               p.status as product_status, p.archived_at as product_archived_at, p.slug, p.name,
               i.available_quantity, i.reserved_quantity,
               img.source as image_source, img.storage_key as image_key, img.alt_text as image_alt
          from product_variants v
          join products p on p.id = v.product_id and p.store_id = st.id
          left join inventory i on i.variant_id = v.id and i.store_id = st.id
          left join lateral (
            select pi.source, pi.storage_key, pi.alt_text from product_images pi
             where pi.product_id = p.id and pi.store_id = st.id
             order by pi.is_primary desc, pi.position asc limit 1
          ) img on true
         where v.store_id = st.id and v.sku in (${sql.join(skus.map((k) => sql`${k}`), sql`, `)})
      ) x on true`)) as unknown as { rows: Row[] }
  const rows = result.rows
  if (!rows.length) throw serviceUnavailable('The store is not set up yet.')
  const currency = rows[0].store_currency

  const bySku = new Map(rows.filter((r) => r.sku).map((r) => [r.sku as string, r]))

  const lines: CartQuoteLine[] = items.map(({ sku, quantity }) => {
    const r = bySku.get(sku)
    const live =
      r &&
      r.product_status === 'active' &&
      !r.product_archived_at &&
      r.variant_status === 'active' &&
      !r.variant_archived_at &&
      r.currency === currency
    if (!r || !live) return { sku, quantity, status: 'unavailable', maxQuantity: 0, product: null, unitPriceMinor: null, compareAtMinor: null, lineTotalMinor: null }

    const sellable = Math.max(0, Number(r.available_quantity ?? 0) - Number(r.reserved_quantity ?? 0))
    const maxQuantity = Math.min(sellable, CART_MAX_QUANTITY)
    const regular = Number(r.price_minor)
    const sale = r.sale_price_minor == null ? null : Number(r.sale_price_minor)
    const unit = sale ?? regular
    return {
      sku,
      quantity,
      status: sellable === 0 ? 'sold_out' : quantity > sellable ? 'insufficient_stock' : 'ok',
      maxQuantity,
      product: {
        slug: r.slug as string,
        name: r.name as string,
        variantTitle: r.title ?? '',
        image: r.image_key ? { url: catalogImageUrl(r.image_source ?? 'static', r.image_key), alt: r.image_alt || (r.name as string) } : null,
      },
      unitPriceMinor: unit,
      compareAtMinor: sale != null ? regular : null,
      lineTotalMinor: unit * quantity,
    }
  })

  const okLines = lines.filter((l) => l.status === 'ok')
  return {
    currency,
    lines,
    subtotalMinor: okLines.reduce((n, l) => n + (l.lineTotalMinor ?? 0), 0),
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    canCheckout: okLines.length === lines.length,
    checkedAt: now.toISOString(),
  }
}

/** Row of the statement above. Columns from the lateral join are null when no SKU matched. */
type Row = {
  store_currency: string
  sku: string | null
  variant_status: string | null
  variant_archived_at: string | Date | null
  title: string | null
  price_minor: number | string | null
  sale_price_minor: number | string | null
  currency: string | null
  product_status: string | null
  product_archived_at: string | Date | null
  slug: string | null
  name: string | null
  available_quantity: number | string | null
  reserved_quantity: number | string | null
  image_source: string | null
  image_key: string | null
  image_alt: string | null
}
