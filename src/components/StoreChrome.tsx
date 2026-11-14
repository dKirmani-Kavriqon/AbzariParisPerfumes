import type { ReactNode } from 'react'
import { getBuildCatalog } from '../server/catalog/build-time'
import { CatalogProvider } from '../state/catalog'
import CartDrawer from './CartDrawer'
import ClientEffects from './ClientEffects'
import Footer from './Footer'
import Header from './Header'

/** The storefront frame: catalogue, header, bag drawer and footer around the page. */
export default async function StoreChrome({ children }: { children: ReactNode }) {
  const catalog = await getBuildCatalog()
  return (
    <CatalogProvider initial={catalog}>
      <ClientEffects />
      <Header />
      <CartDrawer />
      <main>{children}</main>
      <Footer />
    </CatalogProvider>
  )
}
