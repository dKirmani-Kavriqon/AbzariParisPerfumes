import { PGlite } from '@electric-sql/pglite'
import { neon } from '@neondatabase/serverless'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { registerSingleConnectionDb } from '../../src/server/db/atomic'
import * as schema from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/types'
import { ensureStore, type StoreContext } from '../../src/commerce/catalog/store'

/**
 * A database for integration tests.
 * - Default: a fresh in-process Postgres (PGlite) with every migration in ./drizzle applied.
 * - TEST_DATABASE_URL set: Neon's HTTP driver against that database (a throwaway Neon branch
 *   with migrations applied). Never point this at production.
 */
export async function createTestDb(): Promise<{ db: Db; kind: 'pglite' | 'neon'; close: () => Promise<void> }> {
  const url = process.env.TEST_DATABASE_URL
  if (url) {
    return { db: drizzleNeon({ client: neon(url), schema, casing: 'snake_case' }) as unknown as Db, kind: 'neon', close: async () => {} }
  }
  const client = new PGlite()
  for (const m of readMigrationFiles({ migrationsFolder: 'drizzle' })) for (const s of m.sql) if (s.trim()) await client.exec(s)
  const db = drizzlePglite({ client, schema, casing: 'snake_case' }) as unknown as Db
  registerSingleConnectionDb(db)
  return { db, kind: 'pglite', close: () => client.close() }
}

/** A new store with a unique code, so tests never see each other's data. */
export async function newStore(db: Db, currency = 'INR'): Promise<StoreContext> {
  const code = `test-${crypto.randomUUID().slice(0, 12)}`
  return ensureStore(db, { code, name: `Test ${code}`, defaultCurrency: currency })
}

let n = 0
/** Unique, valid SKU / slug fragments for tests. */
export const uniq = (prefix = 'x') => `${prefix}-${Date.now().toString(36)}-${(n++).toString(36)}`
