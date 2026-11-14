'use client'

import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { useCatalog } from '../state/catalog'
import NotFound from './NotFound'
import ProductPage from './ProductPage'

const noSubscribe = () => () => {}

/**
 * Renders /product/<slug> from the live catalogue (see app/(store)/product-view). This page is
 * pre-built at /product-view and served at the product's address, so the slug is only known in
 * the browser: until then it keeps the page's space with a neutral placeholder.
 */
export default function LiveProduct() {
  const pathname = usePathname()
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false)
  const { status, bySlug } = useCatalog()
  const slug = inBrowser ? /^\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(pathname)?.[1] : undefined
  const placeholder = <div className="page wrap" style={{ minHeight: '70vh' }} aria-busy="true" />
  if (!inBrowser) return placeholder
  if (!slug) return <NotFound />
  if (!bySlug(slug)) return status === 'build' ? placeholder : <NotFound />
  return <ProductPage slug={slug} />
}
