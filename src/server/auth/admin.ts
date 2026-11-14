import 'server-only'
import type { ServerEnv } from '../env'
import { AppError, forbidden, unauthorized } from '../http/errors'

/*
 * Admin access boundary (interim, until Phase 5 adds the store's own admin login).
 *
 * Deployed Workers: admin is reachable only through Cloudflare Access. Access authenticates the
 * person at Cloudflare's edge and adds a signed JWT (Cf-Access-Jwt-Assertion header) to each
 * request; we verify that JWT ourselves (RS256 signature against the team's published keys,
 * audience, issuer, expiry) and optionally an email allowlist. Without configuration, every
 * admin request is refused: fail closed.
 *
 * Local development: ADMIN_LOCAL_DEV=1 with APP_ENV=development opens admin on localhost only.
 */

export type AdminIdentity = { email: string | null; method: 'cloudflare-access' | 'local-development' }

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function adminAccessConfigured(env: ServerEnv) {
  return Boolean(env.ADMIN_ACCESS_TEAM_DOMAIN && env.ADMIN_ACCESS_AUD)
}

/** Resolves who is calling, or throws 401/403. Never returns for an unauthenticated caller. */
export async function requireAdmin(request: Request, env: ServerEnv, fetcher: typeof fetch = fetch): Promise<AdminIdentity> {
  const url = new URL(request.url)
  if (env.APP_ENV === 'development' && env.ADMIN_LOCAL_DEV === '1' && LOCAL_HOSTS.has(url.hostname)) {
    return { email: null, method: 'local-development' }
  }
  if (!adminAccessConfigured(env)) throw forbidden('Admin access is not configured for this deployment.')

  const token = request.headers.get('cf-access-jwt-assertion') ?? cookie(request, 'CF_Authorization')
  if (!token) throw unauthorized('Sign in through Cloudflare Access to use the admin.')
  const claims = await verifyAccessJwt(token, env.ADMIN_ACCESS_TEAM_DOMAIN!, env.ADMIN_ACCESS_AUD!, fetcher)
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null

  const allow = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (allow.length && (!email || !allow.includes(email))) throw forbidden('This account is not an admin of this store.')
  return { email, method: 'cloudflare-access' }
}

/**
 * Cross-site request protection for admin writes. Access signs people in with a cookie, which a
 * browser would also send on a request forged by another site. Requiring a same-origin Origin
 * header and a custom header (which other sites cannot add without a CORS preflight we never
 * allow) blocks such requests.
 */
export function assertSameOriginWrite(request: Request) {
  if (request.method === 'GET' || request.method === 'HEAD') return
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) throw forbidden('Cross-site request refused.')
  if (request.headers.get('x-requested-with') !== 'kce-admin') throw forbidden('Missing admin request header.')
}

function cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie') ?? ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

// ---------- JWT verification (RS256, Cloudflare Access) ----------

type Jwk = JsonWebKey & { kid?: string }
const keyCache = new Map<string, { at: number; keys: Jwk[] }>()
const KEY_TTL_MS = 10 * 60 * 1000
const CLOCK_SKEW_S = 60

const b64urlBytes = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(s))) as Record<string, unknown>

async function teamKeys(teamDomain: string, fetcher: typeof fetch, refresh = false): Promise<Jwk[]> {
  const hit = keyCache.get(teamDomain)
  if (hit && !refresh && Date.now() - hit.at < KEY_TTL_MS) return hit.keys
  const res = await fetcher(`https://${teamDomain}/cdn-cgi/access/certs`)
  if (!res.ok) throw new AppError(503, 'service_unavailable', 'Could not verify the admin sign-in. Try again shortly.', { expose: true })
  const body = (await res.json()) as { keys?: Jwk[] }
  const keys = (body.keys ?? []).filter((k) => k.kty === 'RSA')
  keyCache.set(teamDomain, { at: Date.now(), keys })
  return keys
}

export async function verifyAccessJwt(token: string, teamDomain: string, audience: string, fetcher: typeof fetch = fetch) {
  const invalid = () => unauthorized('Your admin sign-in is not valid. Sign in again.')
  const parts = token.split('.')
  if (parts.length !== 3) throw invalid()
  let header: Record<string, unknown>
  let claims: Record<string, unknown>
  try {
    header = b64urlJson(parts[0])
    claims = b64urlJson(parts[1])
  } catch {
    throw invalid()
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw invalid()

  let keys = await teamKeys(teamDomain, fetcher)
  let jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) {
    keys = await teamKeys(teamDomain, fetcher, true) // keys rotate; refresh once
    jwk = keys.find((k) => k.kid === header.kid)
  }
  if (!jwk) throw invalid()

  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]) as BufferSource, new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  if (!ok) throw invalid()

  const now = Math.floor(Date.now() / 1000)
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.includes(audience)) throw invalid()
  if (claims.iss !== `https://${teamDomain}`) throw invalid()
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < now) throw invalid()
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_S > now) throw invalid()
  return claims
}

export function clearAccessKeyCache() {
  keyCache.clear()
}
