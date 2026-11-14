import { notFound } from 'next/navigation'
import { bySlug, products } from '../../../../data/products'
import ProductPage from '../../../../views/ProductPage'

// Every product page is built ahead of time; any other slug is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }))
}

export default async function ProductRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!bySlug(slug)) notFound()
  return <ProductPage slug={slug} />
}
