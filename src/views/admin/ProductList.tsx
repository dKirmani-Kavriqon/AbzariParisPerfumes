'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { parseImageRef } from '../../commerce/catalog/image-url'
import { formatMoney } from '../../commerce/catalog/money'
import { Badge, useAdminData } from './ui'

type Item = { id: string; name: string; slug: string; status: string; featured: boolean; variantCount: number; minPriceMinor: number | null; currency: string | null; totalStock: number; primaryImage: string | null }
type Page = { items: Item[]; total: number; limit: number; offset: number }

const statuses = [
  ['current', 'Draft and live'],
  ['active', 'Live'],
  ['draft', 'Draft'],
  ['archived', 'Archived'],
  ['all', 'Everything'],
] as const

export default function ProductList() {
  const params = useSearchParams()
  const router = useRouter()
  const status = params.get('status') ?? 'current'
  const q = params.get('q') ?? ''
  const offset = Number(params.get('offset') ?? 0) || 0
  const [search, setSearch] = useState(q)
  useEffect(() => setSearch(q), [q])

  const query = new URLSearchParams({ status, limit: '25', offset: String(offset), ...(q ? { q } : {}) })
  const { data, error, loading } = useAdminData<Page>(`/api/admin/products?${query}`)
  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams({ status, ...(q ? { q } : {}), ...next })
    for (const [k, v] of [...p]) if (!v || (k === 'status' && v === 'current') || (k === 'offset' && v === '0')) p.delete(k)
    router.push(`/admin/products${p.size ? `?${p}` : ''}`)
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1 className="display">Products</h1>
        </div>
        <Link href="/admin/products/new" className="btn btn-dark">Add product</Link>
      </div>

      <form
        className="row"
        style={{ marginBottom: 16 }}
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          go({ q: search.trim(), offset: '0' })
        }}
      >
        <label className="field" style={{ flex: '1 1 260px' }}>
          <span className="sr-only">Search products</span>
          <input type="search" placeholder="Search by name, slug, brand or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field">
          <span className="sr-only">Status</span>
          <select value={status} onChange={(e) => go({ status: e.target.value, offset: '0' })}>
            {statuses.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-line" type="submit">Search</button>
      </form>

      <section className="admin-card">
        {error && <p className="field-error">{error}</p>}
        {loading && !data && <p className="muted">Loading…</p>}
        {data && data.items.length === 0 && <p className="muted">No products match.</p>}
        {data && data.items.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th></th><th>Product</th><th>Status</th><th>Variants</th><th>From</th><th>Stock</th></tr>
              </thead>
              <tbody>
                {data.items.map((p) => {
                  const img = parseImageRef(p.primaryImage)
                  return (
                    <tr key={p.id}>
                      <td>{img ? <img className="admin-thumb" src={img} alt="" /> : <span className="admin-thumb" style={{ display: 'block' }} />}</td>
                      <td>
                        <Link href={`/admin/product?id=${p.id}`}><strong>{p.name}</strong></Link>
                        <div className="muted" style={{ fontSize: 12 }}>/{p.slug}{p.featured ? ' · featured' : ''}</div>
                      </td>
                      <td><Badge status={p.status} /></td>
                      <td>{p.variantCount}</td>
                      <td>{p.minPriceMinor != null && p.currency ? formatMoney(p.minPriceMinor, p.currency) : '–'}</td>
                      <td>{p.totalStock}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.limit && (
          <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
            <span className="muted">{data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} of {data.total}</span>
            <div className="row">
              <button className="btn btn-line" disabled={data.offset === 0} onClick={() => go({ offset: String(Math.max(0, data.offset - data.limit)) })}>Previous</button>
              <button className="btn btn-line" disabled={data.offset + data.limit >= data.total} onClick={() => go({ offset: String(data.offset + data.limit) })}>Next</button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
