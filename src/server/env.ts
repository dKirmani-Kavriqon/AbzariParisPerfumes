import 'server-only'
import { z } from 'zod'
import { ConfigError } from './http/errors'

/**
 * Server-only configuration. On Cloudflare these come from Worker variables (wrangler.jsonc
 * `vars`) and Worker secrets (`wrangler secret put`); locally from `.dev.vars` / `.env.local`.
 *
 * The `server-only` import above makes the build fail if browser code ever imports this
 * file, so secrets cannot end up in the client bundle. Values for the browser must be
 * public and go in src/config/store.ts instead.
 */
const serverEnvSchema = z.object({
  APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Pooled Neon connection string. Secret. */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\/[^\s]+$/, 'must be a postgres:// connection string')
    .optional(),
  /**
   * Shared token that unlocks the database check on /api/health. Secret. Without it the
   * deep check is disabled, so anonymous traffic cannot keep the database awake.
   */
  HEALTH_CHECK_TOKEN: z.string().min(32, 'must be at least 32 characters').optional(),
  /**
   * Admin access through Cloudflare Access (Zero Trust, free up to 50 users). Both must be set
   * for admin to work on a deployed Worker; otherwise every admin request is refused.
   * Team domain, e.g. "kavriqon.cloudflareaccess.com"; AUD is the Access application's audience tag.
   */
  ADMIN_ACCESS_TEAM_DOMAIN: z
    .string()
    .regex(/^[a-z0-9-]+\.cloudflareaccess\.com$/, 'must look like <team>.cloudflareaccess.com')
    .optional(),
  ADMIN_ACCESS_AUD: z.string().regex(/^[a-f0-9]{64}$/, 'must be the 64-character Access audience tag').optional(),
  /** Optional comma-separated allowlist of admin emails, checked in addition to the Access policy. */
  ADMIN_EMAILS: z.string().max(2000).optional(),
  /** "1" opens admin on localhost when APP_ENV=development. Ignored everywhere else. */
  ADMIN_LOCAL_DEV: z.enum(['0', '1']).optional(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | undefined

/**
 * Validates and returns the server environment. Throws ConfigError naming the invalid
 * variables (never their values).
 */
export function getServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  if (cached && source === process.env) return cached
  const parsed = serverEnvSchema.safeParse(blankToUndefined(source))
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new ConfigError('Invalid server configuration', problems)
  }
  if (source === process.env) cached = parsed.data
  return parsed.data
}

/** Returns a variable that a feature cannot run without, or throws ConfigError. */
export function requireServerEnv<K extends keyof ServerEnv>(key: K, source?: Record<string, string | undefined>): NonNullable<ServerEnv[K]> {
  const value = getServerEnv(source)[key]
  if (value === undefined || value === null) throw new ConfigError('Missing server configuration', [`${String(key)}: not set`])
  return value as NonNullable<ServerEnv[K]>
}

/** Test helper: forget the cached process.env parse. */
export function resetServerEnvCache() {
  cached = undefined
}

// Treat KEY= (empty) as unset, matching how dotenv files and dashboards are usually filled in.
function blankToUndefined(source: Record<string, string | undefined>) {
  const out: Record<string, string | undefined> = {}
  for (const key of Object.keys(serverEnvSchema.shape)) {
    const v = source[key]
    out[key] = v === undefined || v.trim() === '' ? undefined : v
  }
  return out
}
