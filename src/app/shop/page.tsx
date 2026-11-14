import { Suspense } from 'react'
import Shop, { ShopView } from '../../views/Shop'

export default function ShopPage() {
  return (
    <Suspense fallback={<ShopView c="all" />}>
      <Shop />
    </Suspense>
  )
}
