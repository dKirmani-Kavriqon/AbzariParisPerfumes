import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { displayPrice, leadVariant, productBySlug, type PublicCatalog, type PublicProduct } from '../commerce/catalog/public'

type Line = { slug: string; qty: number }

type CartState = {
  lines: Line[]
  open: boolean
  add: (slug: string, qty?: number) => void
  setQty: (slug: string, qty: number) => void
  remove: (slug: string) => void
  clear: () => void
  setOpen: (open: boolean) => void
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      open: false,
      add: (slug, qty = 1) =>
        set((s) => {
          const hit = s.lines.find((l) => l.slug === slug)
          const lines = hit
            ? s.lines.map((l) => (l.slug === slug ? { ...l, qty: l.qty + qty } : l))
            : [...s.lines, { slug, qty }]
          return { lines, open: true }
        }),
      setQty: (slug, qty) =>
        set((s) => ({
          lines: qty <= 0 ? s.lines.filter((l) => l.slug !== slug) : s.lines.map((l) => (l.slug === slug ? { ...l, qty } : l)),
        })),
      remove: (slug) => set((s) => ({ lines: s.lines.filter((l) => l.slug !== slug) })),
      clear: () => set({ lines: [] }),
      setOpen: (open) => set({ open }),
    }),
    { name: 'abzari-cart', partialize: (s) => ({ lines: s.lines }), skipHydration: true },
  ),
)

export const cartCount = (lines: Line[]) => lines.reduce((n, l) => n + l.qty, 0)

/** Unit price (minor units) of a product in the bag: its lead variant's current price. Display only;
 *  the real total is calculated on the server at checkout (Phase 3B). */
export const unitPrice = (p: PublicProduct | undefined) => {
  const v = p && leadVariant(p)
  return v ? displayPrice(v).price : 0
}
export const cartTotal = (lines: Line[], catalog: PublicCatalog) =>
  lines.reduce((n, l) => n + unitPrice(productBySlug(catalog, l.slug)) * l.qty, 0)
