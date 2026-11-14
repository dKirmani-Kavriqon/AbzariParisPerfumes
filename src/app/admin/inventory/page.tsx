import { Suspense } from 'react'
import Inventory from '../../../views/admin/Inventory'

export default function AdminInventory() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <Inventory />
    </Suspense>
  )
}
