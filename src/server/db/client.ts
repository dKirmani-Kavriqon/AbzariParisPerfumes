import 'server-only'
import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'
import { requireServerEnv } from '../env'
import { serviceUnavailable } from '../http/errors'
import * as schema from './schema'

export type Database = NeonHttpDatabase<typeof schema>

/**
 * Neon over HTTPS (one fetch per query, or per transaction batch). It needs no TCP
 * sockets, no connection pool to manage and no extra Cloudflare service, which suits
 * Workers on the free plan. See docs/DATABASE.md for why this was chosen over Hyperdrive.
 */
let cached: { url: string; db: Database } | undefined

export function getDb(url = requireServerEnv('DATABASE_URL')): Database {
  if (cached?.url === url) return cached.db
  const db = drizzle({ client: neon(url), schema, casing: 'snake_case' })
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
