'use client'

import { usePathname } from 'next/navigation'
import { useCatalog } from '../state/catalog'
import NotFound from './NotFound'
import ProductPage from './ProductPage'

/** Renders /product/<slug> from the live catalogue (see app/(store)/product-view). */
export default function LiveProduct() {
  const pathname = usePathname()
  const { status, bySlug } = useCatalog()
  const slug = /^\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(pathname)?.[1]
  if (!slug) return <NotFound />
  if (!bySlug(slug)) {
    // The live catalogue is still loading: keep the page's space instead of flashing "not found".
    return status === 'build' ? <div className="page wrap" style={{ minHeight: '70vh' }} aria-busy="true" /> : <NotFound />
  }
  return <ProductPage slug={slug} />
}
