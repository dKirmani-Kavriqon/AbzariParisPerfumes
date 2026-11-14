import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

// Pre-rendered pages are served from Workers static assets (free). No R2/KV cache is needed
// while pages are rebuilt on deploy rather than revalidated at runtime. If a later phase adds
// on-demand revalidation (ISR), switch to a KV or R2 cache and review the free-tier limits.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
})
