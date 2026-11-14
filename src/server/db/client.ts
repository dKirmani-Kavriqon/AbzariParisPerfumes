import 'server-only'
import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'
import { requireServerEnv } from '../env'
import { serviceUnavailable } from '../http/errors'
export type Database = NeonHttpDatabase

/**
 * Neon over HTTPS (one fetch per query, or per transaction batch). It needs no TCP
 * sockets, no connection pool to manage and no extra Cloudflare service, which suits
 * Workers on the free plan. See docs/DATABASE.md for why this was chosen over Hyperdrive.
 *
 * Created without the schema: the app uses the query builder and SQL, not Drizzle's relational
 * `db.query` API, and passing the schema makes Drizzle build relation metadata for every table on
 * first use in each Worker instance (CPU on the free plan's 10 ms budget).
 */
let cached: { url: string; db: Database } | undefined

export function getDb(url = requireServerEnv('DATABASE_URL')): Database {
  if (cached?.url === url) return cached.db
  const db = drizzle({ client: neon(url), casing: 'snake_case' })
  cached = { url, db }
  return db
}

/** Round-trips `select 1`. Throws a 503 AppError if the database cannot be reached. */
export async function pingDatabase(db: Database = getDb()) {
  const started = Date.now()
  try {
    await db.execute(sql`select 1`)
  } catch (cause) {
    throw Object.assign(serviceUnavailable('The database is unavailable.'), { cause })
  }
  return { latencyMs: Date.now() - started }
}
