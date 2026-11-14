import { Suspense } from 'react'
import ProductList from '../../../views/admin/ProductList'

export default function AdminProducts() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <ProductList />
    </Suspense>
  )
}
