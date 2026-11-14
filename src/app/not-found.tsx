import StoreChrome from '../components/StoreChrome'
import NotFound from '../views/NotFound'

// Rendered inside the root layout only, so it brings the storefront frame itself.
export default function NotFoundPage() {
  return (
    <StoreChrome>
      <NotFound />
    </StoreChrome>
  )
}
