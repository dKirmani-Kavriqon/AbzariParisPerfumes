import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import { securityHeaders } from './src/config/security-headers'

const isProd = process.env.NODE_ENV === 'production'

// `next dev` gets locally simulated Cloudflare bindings (an R2 bucket for image uploads).
if (process.env.NODE_ENV === 'development') void initOpenNextCloudflareForDev({ configPath: './wrangler.dev.jsonc' })

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Product photos are already compressed .webp files served as static assets. Next's image
  // optimiser would need a paid image service on Cloudflare, so images are served as-is.
  images: { unoptimized: true },
  async headers() {
    return [
      // The CSP would block the dev server's hot reload, so it only applies to production builds.
      { source: '/:path*', headers: isProd ? securityHeaders : securityHeaders.filter((h) => h.key !== 'Content-Security-Policy') },
      // The admin is never indexed by search engines.
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/admin', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ]
  },
}

export default nextConfig
