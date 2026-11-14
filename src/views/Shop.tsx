'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ProductCard from '../components/ProductCard'
import { store } from '../config/store'
import { queryProducts, type CatalogQuery, type PublicCatalog } from '../commerce/catalog/public'
import { useCatalog } from '../state/catalog'

const sorts = [
  { id: 'featured', label: 'Featured', value: 'featured' },
  { id: 'low', label: 'Price, low to high', value: 'price-asc' },
  { id: 'high', label: 'Price, high to low', value: 'price-desc' },
  { id: 'az', label: 'Name, A to Z', value: 'name' },
] as const

/** Reads category (`?c=`) and search (`?q=`) from the address. Must sit inside a Suspense boundary (see app/(store)/shop/page.tsx). */
export default function Shop() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const raw = params.get('c') ?? 'all'
  const c = store.catalogue.categoryAliases[raw] ?? raw
  const q = params.get('q') ?? ''
  // Same as before: a new history entry, no jump to the top.
  const go = (next: { c?: string; q?: string }) => {
    const p = new URLSearchParams()
    const cat = next.c ?? c
    const query = next.q ?? q
    if (cat !== 'all') p.set('c', cat)
    if (query) p.set('q', query)
    router.push(p.size ? `${pathname}?${p}` : pathname, { scroll: false })
  }
  return <ShopView c={c} q={q} onCategory={(id) => go({ c: id })} onSearch={(text) => go({ q: text })} />
}

/** Top-level categories that have something to show, plus "Coming soon" when relevant. */
function tabsFor(catalog: PublicCatalog) {
  const tabs: { id: string; label: string }[] = [{ id: 'all', label: 'All' }]
  for (const cat of catalog.categories.filter((x) => !x.parent)) {
    if (queryProducts(catalog, { category: cat.slug }).length) tabs.push({ id: cat.slug, label: cat.name })
  }
  if (catalog.products.some((p) => p.availability === 'coming_soon')) tabs.push({ id: 'coming-soon', label: 'Coming soon' })
  return tabs
}

/**
 * The shop grid. The pre-rendered HTML uses this with `c="all"` and no search so the page is
 * complete before JavaScript runs; the address is applied on hydration.
 */
export function ShopView({ c, q = '', onCategory, onSearch }: { c: string; q?: string; onCategory?: (id: string) => void; onSearch?: (q: string) => void }) {
  const { catalog, status } = useCatalog()
  const [sort, setSort] = useState<(typeof sorts)[number]['id']>('featured')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [text, setText] = useState(q)

  const tabs = useMemo(() => tabsFor(catalog), [catalog])
  const top = catalog.categories.find((x) => x.slug === c)
  const rootSlug = top?.parent ? rootOf(catalog, c) : c
  const children = catalog.categories.filter((x) => x.parent === rootSlug && queryProducts(catalog, { category: x.slug }).length)

  const list = useMemo(() => {
    const query: CatalogQuery = {
      category: c === 'all' ? undefined : c,
      q: q || undefined,
      availability: inStockOnly ? 'available' : 'all',
      sort: sorts.find((s) => s.id === sort)?.value,
    }
    return queryProducts(catalog, query)
  }, [catalog, c, q, sort, inStockOnly])

  const activeTab = tabs.some((t) => t.id === c) ? c : rootSlug

  return (
    <div className="page wrap">
      <header className="page-head">
        <p className="eyebrow">The collection</p>
        <h1 className="display">Shop</h1>
      </header>
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={activeTab === t.id} className={`tab ${activeTab === t.id ? 'is-active' : ''}`} onClick={() => onCategory?.(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="shop-controls">
          <form
            role="search"
            className="sort"
            onSubmit={(e) => {
              e.preventDefault()
              onSearch?.(text.trim())
            }}
          >
            <label className="sr-only" htmlFor="shop-search">Search the collection</label>
            <input id="shop-search" type="search" placeholder="Search" value={text} maxLength={100} onChange={(e) => setText(e.target.value)} />
          </form>
          <label className="sort">
            <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
            <span>In stock only</span>
          </label>
          <label className="sort">
            <span>{list.length} items · Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              {sorts.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {children.length > 0 && (
        <div className="tabs subtabs" role="tablist" aria-label={`${top?.name ?? ''} categories`}>
          {children.map((x) => (
            <button key={x.slug} role="tab" aria-selected={c === x.slug} className={`tab ${c === x.slug ? 'is-active' : ''}`} onClick={() => onCategory?.(x.slug)}>
              {x.name}
            </button>
          ))}
        </div>
      )}
      {list.length > 0 ? (
        <div className="grid">
          {list.map((p) => (
            <ProductCard key={p.slug} p={p} />
          ))}
        </div>
      ) : (
        <p className="lede">
          {!catalog.products.length && status === 'build'
            ? 'Loading the collection…'
            : !catalog.products.length && status === 'error'
              ? 'We could not load the collection just now. Please refresh the page.'
              : q
                ? `Nothing matches “${q}”.`
                : inStockOnly
                  ? 'Nothing here is in stock right now.'
                  : 'Nothing here yet.'}
        </p>
      )}
    </div>
  )
}

/** The top-level ancestor of a category. */
function rootOf(catalog: PublicCatalog, slug: string): string {
  let cur = catalog.categories.find((x) => x.slug === slug)
  for (let i = 0; cur?.parent && i < 10; i++) cur = catalog.categories.find((x) => x.slug === cur!.parent)
  return cur?.slug ?? slug
}
