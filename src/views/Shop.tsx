'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ProductCard from '../components/ProductCard'
import { products } from '../data/products'

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'parfum', label: 'Eau de Parfum' },
  { id: 'oil', label: 'Perfume Oils' },
  { id: 'soon', label: 'Coming soon' },
]

/** Reads the category from `?c=`. Must sit inside a Suspense boundary (see app/shop/page.tsx). */
export default function Shop() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  // Same as react-router's setSearchParams: a new history entry, no jump to the top.
  const setCategory = (id: string) => router.push(id === 'all' ? pathname : `${pathname}?c=${id}`, { scroll: false })
  return <ShopView c={params.get('c') ?? 'all'} onCategory={setCategory} />
}

/**
 * The shop grid for one category. The pre-rendered HTML uses this with `c="all"` so the
 * page is complete before JavaScript runs; the query string is applied on hydration.
 */
export function ShopView({ c, onCategory }: { c: string; onCategory?: (id: string) => void }) {
  const [sort, setSort] = useState('featured')

  const list = useMemo(() => {
    let l = products.filter((p) =>
      c === 'all' ? true : c === 'soon' ? p.soldOut : p.category === c && !p.soldOut,
    )
    if (sort === 'low') l = [...l].sort((a, b) => a.price - b.price)
    if (sort === 'high') l = [...l].sort((a, b) => b.price - a.price)
    if (sort === 'az') l = [...l].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'featured') l = [...l].sort((a, b) => Number(!!a.soldOut) - Number(!!b.soldOut))
    return l
  }, [c, sort])

  return (
    <div className="page wrap">
      <header className="page-head">
        <p className="eyebrow">The collection</p>
        <h1 className="display">Shop</h1>
      </header>
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={c === t.id}
              className={`tab ${c === t.id ? 'is-active' : ''}`}
              onClick={() => onCategory?.(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="sort">
          <span>{list.length} items · Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="featured">Featured</option>
            <option value="low">Price, low to high</option>
            <option value="high">Price, high to low</option>
            <option value="az">Name, A to Z</option>
          </select>
        </label>
      </div>
      <div className="grid">
        {list.map((p) => (
          <ProductCard key={p.slug} p={p} />
        ))}
      </div>
    </div>
  )
}
