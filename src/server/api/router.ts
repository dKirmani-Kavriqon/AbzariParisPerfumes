import 'server-only'
import { securityHeaders } from '../../config/security-headers'
import { methodNotAllowed, notFound } from '../http/errors'
import { route, type RouteContext } from '../http/route'

export type Handler<D> = (request: Request, ctx: RouteContext<Record<string, string>> & { deps: D }) => Promise<Response> | Response

type Compiled<D> = { method: string; pattern: string; re: RegExp; keys: string[]; handler: Handler<D> }

/**
 * A small path router for /api/* (and /media/*). It runs in the Worker before Next.js, so API
 * requests skip Next's router and rendering, which keeps them well inside the free plan's
 * 10 ms CPU budget. The same router also backs the Next.js catch-all route, so `next dev`
 * serves the identical API.
 *
 * Patterns: "/api/admin/products/:id" (one segment) and "/media/*key" (rest of the path).
 */
export function createRouter<D>() {
  const routes: Compiled<D>[] = []
  const add = (method: string, pattern: string, handler: Handler<D>) => {
    const keys: string[] = []
    const re = new RegExp(
      '^' +
        pattern.replace(/\/(:|\*)([a-zA-Z]+)/g, (_m, kind: string, key: string) => {
          keys.push(key)
          return kind === ':' ? '/([^/]+)' : '/(.+)'
        }) +
        '$',
    )
    routes.push({ method, pattern, re, keys, handler })
  }

  async function handle(request: Request, deps: D): Promise<Response> {
    const path = new URL(request.url).pathname
    const matches = routes.filter((r) => r.re.test(path))
    const hit = matches.find((r) => r.method === request.method || (request.method === 'HEAD' && r.method === 'GET'))
    const run = route<Record<string, string>>(async (req, ctx) => {
      if (!matches.length) throw notFound('There is no API endpoint at this address.')
      if (!hit) throw methodNotAllowed([...new Set(matches.map((m) => m.method))])
      const values = hit.re.exec(path)!.slice(1)
      const params: Record<string, string> = {}
      hit.keys.forEach((k, i) => (params[k] = decodeURIComponent(values[i])))
      return hit.handler(req, { ...ctx, params, deps })
    })
    return withSecurityHeaders(await run(request), path)
  }

  return {
    get: (p: string, h: Handler<D>) => add('GET', p, h),
    post: (p: string, h: Handler<D>) => add('POST', p, h),
    put: (p: string, h: Handler<D>) => add('PUT', p, h),
    patch: (p: string, h: Handler<D>) => add('PATCH', p, h),
    delete: (p: string, h: Handler<D>) => add('DELETE', p, h),
    handle,
    routes: () => routes.map((r) => `${r.method} ${r.pattern}`),
  }
}

/** Responses from this router bypass next.config headers, so apply the same security headers here. */
function withSecurityHeaders(res: Response, path: string) {
  const out = new Response(res.body, res)
  for (const { key, value } of securityHeaders) if (!out.headers.has(key)) out.headers.set(key, value)
  if (path.startsWith('/api/admin')) out.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return out
}
