import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { bySlug } from '../data/products'

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
export const cartTotal = (lines: Line[]) =>
  lines.reduce((n, l) => n + (bySlug(l.slug)?.price ?? 0) * l.qty, 0)
