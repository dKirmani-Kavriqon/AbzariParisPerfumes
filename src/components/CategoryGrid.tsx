'use client'

import { queryProducts } from '../commerce/catalog/public'
import { useCatalog } from '../state/catalog'
import ProductCard from './ProductCard'
import Reveal from './Reveal'

/** The product grid for one category (and its subcategories), from the live catalogue. */
export default function CategoryGrid({ categorySlug, exclude }: { categorySlug: string; exclude?: string }) {
  const { catalog, status } = useCatalog()
  const list = queryProducts(catalog, { category: categorySlug }).filter((p) => p.slug !== exclude)
  if (!list.length) {
    return status === 'build' && !catalog.products.length ? <p className="fine">Loading the collection…</p> : null
  }
  return (
    <div className="grid">
      {list.map((p, i) => (
        <Reveal key={p.slug} delay={(i % 4) * 70}>
          <ProductCard p={p} />
        </Reveal>
      ))}
    </div>
  )
}
