/*
 * Cart rules shared by the browser and the server. Browser-safe: no database, no framework.
 *
 * The browser keeps only what the shopper chose: SKUs and quantities. It never keeps prices or
 * stock; those come from the server's quote (quote.ts) every time the cart is loaded or changed.
 */
import { z } from 'zod'
import { SKU_RE } from '../catalog/validation'

/** Most distinct items a cart can hold. Keeps quotes small and cheap. */
export const CART_MAX_LINES = 20
/** Most units of one item per order. Also the most stock the cart ever reveals ("only 3 left"). */
export const CART_MAX_QUANTITY = 10
/** A saved cart is forgotten after 30 days without changes. */
export const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type CartItem = { sku: string; quantity: number }

// ---------- what the browser sends to the server ----------

const cartItemSchema = z
  .object({
    sku: z.string().regex(SKU_RE, 'Not a valid product code.'),
    quantity: z.number().int('Quantity must be a whole number.').min(1, 'Quantity must be at least 1.').max(CART_MAX_QUANTITY, `At most ${CART_MAX_QUANTITY} of one item.`),
  })
  .strict()

/**
 * Body of POST /api/cart/quote. Strict: a request carrying prices, totals or a store id is
 * refused outright rather than silently half-trusted.
 */
export const cartQuoteSchema = z
  .object({ items: z.array(cartItemSchema).max(CART_MAX_LINES, `At most ${CART_MAX_LINES} different items.`) })
  .strict()

/** Same SKU listed twice → one line with the quantities added (capped). Order is kept. */
export function mergeItems(items: CartItem[]): CartItem[] {
  const out: CartItem[] = []
  for (const it of items) {
    const hit = out.find((o) => o.sku === it.sku)
    if (hit) hit.quantity = Math.min(CART_MAX_QUANTITY, hit.quantity + it.quantity)
    else out.push({ sku: it.sku, quantity: Math.min(CART_MAX_QUANTITY, it.quantity) })
  }
  return out
}

// ---------- operations (pure; the browser store applies them, then asks the server) ----------

const clampQty = (n: number) => Math.max(1, Math.min(CART_MAX_QUANTITY, Math.trunc(n)))

export function addItem(items: CartItem[], sku: string, quantity = 1): CartItem[] {
  if (!SKU_RE.test(sku) || !Number.isFinite(quantity) || quantity < 1) return items
  const hit = items.find((i) => i.sku === sku)
  if (hit) return items.map((i) => (i.sku === sku ? { sku, quantity: clampQty(i.quantity + quantity) } : i))
  if (items.length >= CART_MAX_LINES) return items
  return [...items, { sku, quantity: clampQty(quantity) }]
}

/** Sets a line's quantity (1..max). Use removeItem to take a line out. */
export function setQuantity(items: CartItem[], sku: string, quantity: number): CartItem[] {
  if (!Number.isFinite(quantity)) return items
  return items.map((i) => (i.sku === sku ? { sku, quantity: clampQty(quantity) } : i))
}

export const removeItem = (items: CartItem[], sku: string): CartItem[] => items.filter((i) => i.sku !== sku)

export const itemCount = (items: CartItem[]) => items.reduce((n, i) => n + i.quantity, 0)

// ---------- browser persistence ----------

export const CART_STORAGE_VERSION = 2
export const cartStorageKey = (storeCode: string) => `kce-cart:${storeCode}`

export type StoredCart = {
  v: typeof CART_STORAGE_VERSION
  store: string
  items: CartItem[]
  updatedAt: number
  /** Last price shown per SKU, only to tell the shopper "price updated". Never sent to the server. */
  seen?: Record<string, number>
}

export function serializeCart(storeCode: string, items: CartItem[], now: number, seen: Record<string, number> = {}): string {
  const body: StoredCart = { v: CART_STORAGE_VERSION, store: storeCode, items, updatedAt: now, seen }
  return JSON.stringify(body)
}

/** The "last seen" prices of a saved cart, for SKUs still in it. */
export function parseSeenPrices(raw: string | null, items: CartItem[]): Record<string, number> {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<StoredCart>).seen : null
    if (!v || typeof v !== 'object') return {}
    return Object.fromEntries(Object.entries(v).filter(([k, n]) => items.some((i) => i.sku === k) && Number.isSafeInteger(n) && (n as number) >= 0))
  } catch {
    return {}
  }
}

/**
 * Reads a saved cart. Anything unexpected (another store, an old format, expired, edited by hand)
 * gives an empty cart or drops the bad lines. Whatever survives is still checked by the server.
 */
export function parseStoredCart(raw: string | null, storeCode: string, now: number): CartItem[] {
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  const v = value as Partial<StoredCart> | null
  if (!v || v.v !== CART_STORAGE_VERSION || v.store !== storeCode || typeof v.updatedAt !== 'number') return []
  if (now - v.updatedAt > CART_TTL_MS || v.updatedAt > now + 60_000) return []
  if (!Array.isArray(v.items)) return []
  const valid = v.items.filter((i): i is CartItem => cartItemSchema.safeParse(i).success)
  return mergeItems(valid).slice(0, CART_MAX_LINES)
}

// ---------- the server's answer ----------

export type CartLineStatus =
  /** Can be bought in this quantity right now (not a promise: stock is only reserved at checkout). */
  | 'ok'
  /** Fewer in stock than asked for; `maxQuantity` says how many can be bought. */
  | 'insufficient_stock'
  /** Live product, none in stock. */
  | 'sold_out'
  /** Unknown, unpublished, archived or withdrawn. No details are given. */
  | 'unavailable'

export type CartQuoteLine = {
  sku: string
  quantity: number
  status: CartLineStatus
  /** Most that can be bought now (0..CART_MAX_QUANTITY). */
  maxQuantity: number
  product: { slug: string; name: string; variantTitle: string; image: { url: string; alt: string } | null } | null
  /** What one costs now (sale price when there is one), in minor units. null when unavailable. */
  unitPriceMinor: number | null
  /** The regular price when on sale, else null. */
  compareAtMinor: number | null
  /** unitPriceMinor × quantity, or null when unavailable. */
  lineTotalMinor: number | null
}

export type CartQuote = {
  currency: string
  lines: CartQuoteLine[]
  /** Sum of the lines that can be bought as they are ("ok"). Integer minor units. */
  subtotalMinor: number
  itemCount: number
  /** True only when the cart has items and every line is "ok". */
  canCheckout: boolean
  checkedAt: string
}
