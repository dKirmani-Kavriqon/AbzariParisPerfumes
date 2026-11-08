import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import { products } from '../data/products'

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'parfum', label: 'Eau de Parfum' },
  { id: 'oil', label: 'Perfume Oils' },
  { id: 'soon', label: 'Coming soon' },
]

export default function Shop() {
  const [params, setParams] = useSearchParams()
  const c = params.get('c') ?? 'all'
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
              onClick={() => setParams(t.id === 'all' ? {} : { c: t.id })}
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
