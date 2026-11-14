'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { productBySlug, type PublicCatalog } from '../commerce/catalog/public'
import type { ApiResponse } from '../types/api'

type Status = 'build' | 'live' | 'error'
type Value = { catalog: PublicCatalog; status: Status; bySlug: (slug: string) => ReturnType<typeof productBySlug> }

const CatalogContext = createContext<Value | null>(null)

/**
 * Supplies the catalogue to storefront components. It starts with the catalogue baked in at build
 * time (identical to the pre-rendered HTML), then loads the live published catalogue, so changes
 * made in the admin after the build (new products, prices, stock) appear straight away.
 * Prices and availability are never taken from anything the browser sends.
 */
export function CatalogProvider({ initial, children }: { initial: PublicCatalog; children: ReactNode }) {
  const [catalog, setCatalog] = useState(initial)
  const [status, setStatus] = useState<Status>('build')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/catalog', { cache: 'no-cache', headers: { accept: 'application/json' } })
        const body = (await res.json()) as ApiResponse<PublicCatalog>
        if (cancelled) return
        if (body.ok && body.data.schema === 1) {
          setCatalog((current) => (body.data.generatedAt === current.generatedAt ? current : body.data))
          setStatus('live')
        } else setStatus('error')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    void load()
    // Refresh when the shopper comes back to the tab, so a long-open page does not go stale.
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const value = useMemo<Value>(() => ({ catalog, status, bySlug: (slug) => productBySlug(catalog, slug) }), [catalog, status])
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog(): Value {
  const v = useContext(CatalogContext)
  if (!v) throw new Error('useCatalog must be used inside CatalogProvider')
  return v
}
