import LiveProduct from '../../../views/LiveProduct'

// A pre-built shell for products added after the last build. worker.ts serves it at the
// product's own address (/product/<slug>); the page reads the slug from the address and renders
// the normal product page from the live catalogue.
export default function ProductViewShell() {
  return <LiveProduct />
}
