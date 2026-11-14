/*
 * The shopping bag in the browser.
 *
 * Kept in localStorage: SKUs, quantities, when it last changed, and the last price the shopper saw
 * (only to say "price updated"; never sent anywhere). Everything shown as a price or availability
 * comes from the server's quote (POST /api/cart/quote), fetched when the bag loads and after every
 * change. The browser never works out a price or a total.
 */
import { createStore, useStore } from 'zustand'
import {
  addItem as addTo,
  cartStorageKey,
  CART_TTL_MS,
  itemCount,
  parseSeenPrices,
  parseStoredCart,
  removeItem as removeFrom,
  serializeCart,
  setQuantity as setQty,
  type CartItem,
  type CartQuote,
} from '../commerce/cart/cart'
import { store as storeConfig } from '../config/store'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type CartStatus = 'idle' | 'checking' | 'ready' | 'error'
export type CartNotice = { kind: 'added' | 'limited' | 'unavailable' | 'error'; sku: string; message: string; at: number }
export type AddResult = 'added' | 'limited' | 'unavailable' | 'unchecked' | 'busy'

export type CartState = {
  items: CartItem[]
  /** Last price the shopper was shown per SKU, to point out changes. Display only. */
  seen: Record<string, number>
  hydrated: boolean
  open: boolean
  quote: CartQuote | null
  status: CartStatus
  error: string | null
  /** SKU being added (buttons are disabled meanwhile, so rapid clicks add once). */
  adding: string | null
  notice: CartNotice | null
  hydrate: () => void
  refresh: () => Promise<void>
  add: (sku: string, quantity?: number) => Promise<AddResult>
  setQuantity: (sku: string, quantity: number) => void
  remove: (sku: string) => void
  clear: () => void
  setOpen: (open: boolean) => void
  acknowledgePrices: () => void
  dismissNotice: () => void
}

type Options = { storeCode: string; storage: () => StorageLike | null; fetch: typeof fetch; now: () => number; debounceMs: number }

const LEGACY_KEY = 'abzari-cart' // Phase 1–3A bag (slugs, no expiry); dropped on load
const QUOTE_FRESH_MS = 60_000
const UNREACHABLE = 'We could not check your bag just now. Please try again in a moment.'

export function createCartStore(opts: Options) {
  const key = cartStorageKey(opts.storeCode)
  let seq = 0
  let inflight: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  async function requestQuote(items: CartItem[]): Promise<{ seq: number; quote?: CartQuote; error?: string }> {
    const mine = ++seq
    inflight?.abort()
    const ctrl = new AbortController()
    inflight = ctrl
    try {
      const res = await opts.fetch('/api/cart/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
        signal: ctrl.signal,
        cache: 'no-store',
      })
      const body = (await res.json().catch(() => null)) as { ok: boolean; data?: CartQuote; error?: { message?: string } } | null
      if (!res.ok || !body?.ok || !body.data) return { seq: mine, error: body?.error?.message || UNREACHABLE }
      return { seq: mine, quote: body.data }
    } catch {
      return { seq: mine, error: UNREACHABLE }
    } finally {
      if (inflight === ctrl) inflight = null
    }
  }

  const s = createStore<CartState>()((set, get) => {
    function save(items: CartItem[], seen: Record<string, number>) {
      try {
        const storage = opts.storage()
        if (!storage) return
        if (!items.length) storage.removeItem(key)
        else storage.setItem(key, serializeCart(opts.storeCode, items, opts.now(), seen))
      } catch {
        // Private browsing or storage full: the bag still works for this visit.
      }
    }

    function commit(items: CartItem[]) {
      const known = new Set(items.map((i) => i.sku))
      const seen = Object.fromEntries(Object.entries(get().seen).filter(([k]) => known.has(k)))
      set({ items, seen })
      save(items, seen)
    }

    /** Asks the server about the current items; a newer request makes older answers irrelevant. */
    async function sync(): Promise<void> {
      if (timer) clearTimeout(timer)
      timer = null
      const items = get().items
      if (!items.length) {
        seq++
        inflight?.abort()
        set({ quote: null, status: 'idle', error: null })
        return
      }
      set({ status: 'checking' })
      const r = await requestQuote(items)
      if (r.seq !== seq) return // a newer change is being checked
      if (r.quote) {
        const seen = { ...get().seen }
        for (const l of r.quote.lines) if (l.unitPriceMinor != null && seen[l.sku] == null) seen[l.sku] = l.unitPriceMinor
        set({ quote: r.quote, status: 'ready', error: null, seen })
        save(get().items, seen)
      } else set({ status: 'error', error: r.error ?? UNREACHABLE })
    }

    function syncSoon() {
      if (timer) clearTimeout(timer)
      set({ status: get().items.length ? 'checking' : 'idle' })
      timer = setTimeout(() => void sync(), opts.debounceMs)
    }

    return {
      items: [],
      seen: {},
      hydrated: false,
      open: false,
      quote: null,
      status: 'idle',
      error: null,
      adding: null,
      notice: null,

      hydrate() {
        let raw: string | null = null
        try {
          const storage = opts.storage()
          storage?.removeItem(LEGACY_KEY)
          raw = storage?.getItem(key) ?? null
        } catch {
          raw = null
        }
        const items = parseStoredCart(raw, opts.storeCode, opts.now())
        const seen = parseSeenPrices(raw, items)
        if (raw && !items.length) save([], {}) // expired or unreadable: forget it
        set({ items, seen, hydrated: true })
        if (items.length) void sync()
      },

      refresh: () => sync(),

      async add(sku, quantity = 1) {
        if (get().adding) return 'busy'
        set({ adding: sku })
        const before = get().items
        const next = addTo(before, sku, quantity)
        if (timer) clearTimeout(timer)
        set({ status: 'checking' })
        const r = await requestQuote(next)
        const now = opts.now()
        try {
          if (r.seq !== seq) {
            // Something else changed the bag meanwhile; keep the add and recheck everything.
            commit(addTo(get().items, sku, quantity))
            void sync()
            return 'unchecked'
          }
          if (!r.quote) {
            // Could not check: keep it in the bag, but checkout stays closed until a check succeeds.
            commit(next)
            set({ status: 'error', error: r.error ?? UNREACHABLE, open: true, notice: { kind: 'error', sku, message: 'Added to your bag. We could not confirm availability yet.', at: now } })
            return 'unchecked'
          }
          const line = r.quote.lines.find((l) => l.sku === sku)
          if (!line || line.status === 'unavailable' || line.status === 'sold_out' || line.maxQuantity === 0) {
            set({ notice: { kind: 'unavailable', sku, message: line?.status === 'sold_out' ? 'Sorry, this is sold out.' : 'Sorry, this is no longer available.', at: now } })
            void sync() // price the bag as it was
            return 'unavailable'
          }
          if (line.status === 'insufficient_stock') {
            commit(setQty(next, sku, line.maxQuantity))
            set({ open: true, notice: { kind: 'limited', sku, message: `Only ${line.maxQuantity} available, so your bag has ${line.maxQuantity}.`, at: now } })
            void sync()
            return 'limited'
          }
          commit(next)
          const seen = { ...get().seen }
          for (const l of r.quote.lines) if (l.unitPriceMinor != null) seen[l.sku] ??= l.unitPriceMinor
          seen[sku] = line.unitPriceMinor ?? seen[sku]
          set({ quote: r.quote, status: 'ready', error: null, seen, open: true, notice: { kind: 'added', sku, message: `${line.product?.name ?? 'Item'} added to your bag.`, at: now } })
          save(get().items, seen)
          return 'added'
        } finally {
          set({ adding: null })
        }
      },

      setQuantity(sku, quantity) {
        commit(setQty(get().items, sku, quantity))
        syncSoon()
      },

      remove(sku) {
        commit(removeFrom(get().items, sku))
        syncSoon()
      },

      clear() {
        commit([])
        void sync()
      },

      setOpen(open) {
        if (open === get().open) return
        if (!open) get().acknowledgePrices()
        set({ open })
        const q = get().quote
        if (open && get().items.length && (!q || opts.now() - Date.parse(q.checkedAt) > QUOTE_FRESH_MS || get().status === 'error')) void sync()
      },

      acknowledgePrices() {
        const q = get().quote
        if (!q) return
        const seen = { ...get().seen }
        for (const l of q.lines) if (l.unitPriceMinor != null) seen[l.sku] = l.unitPriceMinor
        set({ seen })
        save(get().items, seen)
      },

      dismissNotice: () => set({ notice: null }),
    }
  })
  return s
}

export type CartStore = ReturnType<typeof createCartStore>

/** The quote describes exactly the items in the bag (no change waiting to be checked). */
export function quoteIsCurrent(items: CartItem[], quote: CartQuote | null): quote is CartQuote {
  if (!quote || quote.lines.length !== items.length) return false
  return items.every((it, i) => quote.lines[i].sku === it.sku && quote.lines[i].quantity === it.quantity)
}

export const cartCount = itemCount
export { CART_TTL_MS }

// ---------- the app's bag ----------

const browserStorage = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export const cartStore = createCartStore({
  storeCode: storeConfig.id,
  storage: browserStorage,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  debounceMs: 300,
})

export function useCart(): CartState
export function useCart<T>(selector: (s: CartState) => T): T
export function useCart<T>(selector?: (s: CartState) => T) {
  return useStore(cartStore, selector ?? ((s) => s as unknown as T))
}
useCart.getState = () => cartStore.getState()
