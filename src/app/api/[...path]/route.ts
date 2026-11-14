import { getCloudflareContext } from '@opennextjs/cloudflare'
import { defaultDeps, type WorkerBindings } from '../../../server/api/deps'
import { api } from '../../../server/api/routes'

/*
 * Next.js entry for /api/*. On Cloudflare the custom Worker (worker.ts) answers /api/* before
 * Next.js runs, so this file is only used by `next dev` / `next start` and as a fallback. Both
 * paths use the same router, so behaviour is identical.
 */
export const dynamic = 'force-dynamic'

function bindings(): WorkerBindings {
  try {
    return getCloudflareContext().env as WorkerBindings
  } catch {
    return {}
  }
}

const handler = (request: Request) => api().handle(request, defaultDeps(bindings()))

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
