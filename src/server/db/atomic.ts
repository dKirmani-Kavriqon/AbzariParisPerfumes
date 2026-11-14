import { sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Db } from './types'

/**
 * Drivers that are a single connection used by one caller at a time (PGlite in tests).
 * Only these may use the BEGIN/COMMIT fallback below.
 */
const singleConnection = new WeakSet<object>()
export function registerSingleConnectionDb(db: object) {
  singleConnection.add(db)
}

type Batch = readonly [BatchItem<'pg'>, ...BatchItem<'pg'>[]]

/**
 * Runs several writes as one transaction: all succeed or none are applied.
 *
 * On Neon's HTTP driver this is `db.batch`, which sends every statement in one request and
 * runs them in a single database transaction. Statements cannot depend on each other's
 * results, so callers generate ids up front (crypto.randomUUID()).
 */
export async function atomic(db: Db, queries: Batch): Promise<unknown[]> {
  const withBatch = db as Db & { batch?: (q: Batch) => Promise<unknown[]> }
  if (typeof withBatch.batch === 'function') return withBatch.batch(queries)
  if (!singleConnection.has(db)) throw new Error('atomic(): this database driver has no batch support')
  await db.execute(sql`begin`)
  try {
    const results: unknown[] = []
    for (const q of queries) results.push(await q)
    await db.execute(sql`commit`)
    return results
  } catch (error) {
    await db.execute(sql`rollback`)
    throw error
  }
}
