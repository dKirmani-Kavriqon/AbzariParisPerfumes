import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/400-italic.css'
import '@fontsource-variable/jost'
import '../styles/tailwind.css'
import '../styles/site.css'
import { store } from '../config/store'

export const metadata: Metadata = {
  title: store.name,
  description: store.description,
  icons: { icon: { url: store.branding.favicon, type: 'image/png' } },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: store.branding.themeColor,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* The storefront frame lives in app/(store)/layout.tsx; the admin has its own layout. */}
      <body>{children}</body>
    </html>
  )
}
