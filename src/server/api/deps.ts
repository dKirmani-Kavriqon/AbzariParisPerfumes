import 'server-only'
import { store } from '../../config/store'
import { getDb } from '../db/client'
import type { Db } from '../db/types'
import { getServerEnv, type ServerEnv } from '../env'
import { r2Store, type ObjectStore, type R2BucketLike } from '../storage/object-store'

/** Everything a handler needs from outside, injected so tests can swap any of it. */
export type ApiDeps = {
  db: () => Db
  env: () => ServerEnv
  storeCode: string
  storeName: string
  /** null when no bucket is bound: uploads answer 503 instead of failing obscurely. */
  objectStore: () => ObjectStore | null
  fetch: typeof fetch
}

/** Cloudflare bindings this app knows about (see wrangler.jsonc). */
export type WorkerBindings = { MEDIA_BUCKET?: R2BucketLike } & Record<string, unknown>

export function defaultDeps(bindings: WorkerBindings = {}): ApiDeps {
  return {
    db: () => getDb() as unknown as Db,
    env: () => getServerEnv(),
    storeCode: store.id,
    storeName: store.name,
    objectStore: () => (bindings.MEDIA_BUCKET ? r2Store(bindings.MEDIA_BUCKET) : null),
    fetch: (...args) => fetch(...args),
  }
}
