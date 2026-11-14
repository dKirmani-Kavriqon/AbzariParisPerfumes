'use client'

import Link from 'next/link'
import { useSession } from './AdminShell'
import { useAdminData } from './ui'

type List = { total: number }
type Stock = { variantId: string; productName: string; sku: string; availableQuantity: number; lowStockThreshold: number; productId: string }[]

export default function Overview() {
  const session = useSession()
  const current = useAdminData<List>('/api/admin/products?limit=1')
  const active = useAdminData<List>('/api/admin/products?limit=1&status=active')
  const low = useAdminData<Stock>('/api/admin/inventory?lowStock=true&limit=10')
  const stat = (label: string, value: number | undefined, href: string) => (
    <Link href={href} className="admin-card" style={{ display: 'block' }}>
      <p className="eyebrow">{label}</p>
      <p className="display" style={{ margin: 0, fontSize: 44 }}>{value ?? '–'}</p>
    </Link>
  )
  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">{session?.store.name}</p>
          <h1 className="display">Overview</h1>
        </div>
        <Link href="/admin/products/new" className="btn btn-dark">Add product</Link>
      </div>
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {stat('Products', current.data?.total, '/admin/products')}
        {stat('Live on the site', active.data?.total, '/admin/products?status=active')}
        {stat('Low on stock', low.data?.length, '/admin/inventory?lowStock=true')}
      </div>
      <section className="admin-card">
        <h2>Low stock</h2>
        {low.error && <p className="field-error">{low.error}</p>}
        {low.data && low.data.length === 0 && <p className="muted">Nothing is at or below its low-stock threshold.</p>}
        {low.data && low.data.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Product</th><th>SKU</th><th>In stock</th><th>Threshold</th></tr></thead>
              <tbody>
                {low.data.map((r) => (
                  <tr key={r.variantId}>
                    <td><Link href={`/admin/product?id=${r.productId}`}>{r.productName}</Link></td>
                    <td>{r.sku}</td>
                    <td>{r.availableQuantity}</td>
                    <td>{r.lowStockThreshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
