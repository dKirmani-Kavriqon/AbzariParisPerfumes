import { eq } from 'drizzle-orm'
import { stores } from '../../server/db/schema'
import type { Db } from '../../server/db/types'
import { serviceUnavailable } from '../../server/http/errors'

export type StoreContext = { id: string; code: string; defaultCurrency: string }

const cache = new Map<string, StoreContext>()

/**
 * Looks up this deployment's store row by its code (src/config/store.ts `id`). The id is cached
 * for the life of the Worker instance; it never changes once created.
 */
export async function resolveStore(db: Db, code: string): Promise<StoreContext> {
  const hit = cache.get(code)
  if (hit) return hit
  const [row] = await db.select({ id: stores.id, code: stores.code, defaultCurrency: stores.defaultCurrency }).from(stores).where(eq(stores.code, code)).limit(1)
  if (!row) throw serviceUnavailable('The store is not set up yet. Run the catalogue seed (npm run db:seed).')
  cache.set(code, row)
  return row
}

/** Creates the store row if it does not exist (used by the seed script and tests). */
export async function ensureStore(db: Db, input: { code: string; name: string; defaultCurrency: string }): Promise<StoreContext> {
  await db.insert(stores).values(input).onConflictDoNothing({ target: stores.code })
  const [row] = await db.select({ id: stores.id, code: stores.code, defaultCurrency: stores.defaultCurrency }).from(stores).where(eq(stores.code, input.code)).limit(1)
  return row
}

export function clearStoreCache() {
  cache.clear()
}
