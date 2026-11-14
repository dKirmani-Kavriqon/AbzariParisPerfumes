import { notFound } from 'next/navigation'
import { getBuildCatalog } from '../../../../server/catalog/build-time'
import ProductPage from '../../../../views/ProductPage'

// A page is pre-built for every live product at build time. Products added later are served by
// worker.ts from the live catalogue (see app/(store)/product-view), and products archived after the
// build are answered with a 404 by worker.ts, so no request ever renders on demand.
export const dynamicParams = false

export async function generateStaticParams() {
  const catalog = await getBuildCatalog()
  return catalog.products.map((p) => ({ slug: p.slug }))
}

export default async function ProductRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const catalog = await getBuildCatalog()
  if (!catalog.products.some((p) => p.slug === slug)) notFound()
  return <ProductPage slug={slug} />
}
