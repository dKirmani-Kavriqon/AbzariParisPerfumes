'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useCart, type AddResult } from '../state/cart'

type Props = {
  sku: string
  quantity?: number
  className: string
  children: ReactNode
  /** Accessible name when the visible label is not enough (e.g. "Add Rawah to bag"). */
  label?: string
  onResult?: (result: AddResult) => void
}

/**
 * "Add to bag": disabled while any add is being checked (so rapid clicks add once), says
 * "Adding…" meanwhile, and briefly says why when the item could not be added.
 */
export default function AddToBagButton({ sku, quantity = 1, className, children, label, onResult }: Props) {
  const add = useCart((s) => s.add)
  const adding = useCart((s) => s.adding)
  const [refused, setRefused] = useState(false)
  useEffect(() => {
    if (!refused) return
    const t = setTimeout(() => setRefused(false), 4000)
    return () => clearTimeout(t)
  }, [refused])

  const busy = adding === sku
  return (
    <button
      className={className}
      aria-label={label}
      aria-busy={busy}
      disabled={adding !== null}
      onClick={async () => {
        const result = await add(sku, quantity)
        if (result === 'unavailable') setRefused(true)
        onResult?.(result)
      }}
    >
      {busy ? 'Adding…' : refused ? 'Unavailable' : children}
    </button>
  )
}
