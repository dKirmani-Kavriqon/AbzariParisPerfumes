import { Suspense } from 'react'
import ProductEditor from '../../../views/admin/ProductEditor'

// /admin/product?id=<uuid>: a static page that loads the product in the browser, so viewing
// a product never needs server rendering (which would cost Worker CPU on the free plan).
export default function AdminProduct() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <ProductEditor />
    </Suspense>
  )
}
