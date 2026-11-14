import { getCloudflareContext } from '@opennextjs/cloudflare'
import { defaultDeps, type WorkerBindings } from '../../../server/api/deps'
import { api } from '../../../server/api/routes'

// Uploaded product images for `next dev` / `next start`. On Cloudflare, worker.ts serves
// /media/* through the same router before Next.js runs.
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  let bindings: WorkerBindings = {}
  try {
    bindings = getCloudflareContext().env as WorkerBindings
  } catch {
    // no Cloudflare context (plain next start): uploads are not configured
  }
  return api().handle(request, defaultDeps(bindings))
}
