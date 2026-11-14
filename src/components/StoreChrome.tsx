import type { ReactNode } from 'react'
import CartDrawer from './CartDrawer'
import ClientEffects from './ClientEffects'
import Footer from './Footer'
import Header from './Header'

/** The storefront frame: header, bag drawer and footer around the page. */
export default function StoreChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <ClientEffects />
      <Header />
      <CartDrawer />
      <main>{children}</main>
      <Footer />
    </>
  )
}
