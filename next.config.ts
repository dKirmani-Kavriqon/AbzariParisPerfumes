import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Product photos are already compressed .webp files served as static assets. Next's image
  // optimiser would need a paid image service on Cloudflare, so images are served as-is.
  images: { unoptimized: true },
}

export default nextConfig
