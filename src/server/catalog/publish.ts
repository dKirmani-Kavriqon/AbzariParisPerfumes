import 'server-only'
import { buildPublicCatalog } from '../../commerce/catalog/public-build'
import type { PublicCatalog } from '../../commerce/catalog/public'
import { resolveStore } from '../../commerce/catalog/store'
import type { Db } from '../db/types'
import { serviceUnavailable } from '../http/errors'
import type { Logger } from '../log'
import type { ObjectStore } from '../storage/object-store'

/*
 * The published catalogue: one JSON document per store in the object store (R2).
 *
 * - Written after every admin change to the catalogue (publishCatalog), so the shop sees changes
 *   within seconds without a rebuild.
 * - Read by public requests (getPublishedCatalog) from memory (10 s) → R2 → database. Shoppers
 *   therefore never wake the database, which keeps Neon's metered compute for the admin.
 * - Without an object store (tests, plain `next start`), it is built from the database and kept
 *   in memory for 30 s.
 */

export type Published = { catalog: PublicCatalog; mediaKeys: string[]; etag: string }
type Deps = { db: () => Db; storeCode: string; objectStore: () => ObjectStore | null; log?: Logger }

export const catalogKey = (storeCode: string) => `stores/${storeCode}/catalog/public.json`
const MEMORY_TTL_MS = 10_000
const NO_STORE_TTL_MS = 30_000
const memory = new Map<string, { at: number; ttl: number; value: Published }>()

async function etagOf(json: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))
  return `"${[...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')}"`
}

async function fromDatabase(deps: Deps): Promise<Published> {
  const db = deps.db()
  const store = await resolveStore(db, deps.storeCode)
  const { catalog, mediaKeys } = await buildPublicCatalog(db, store)
  const json = JSON.stringify(catalog)
  return { catalog, mediaKeys, etag: await etagOf(json) }
}

async function readStored(store: ObjectStore, key: string): Promise<Published | null> {
  const obj = await store.get(key)
  if (!obj) return null
  const text = obj.body instanceof ArrayBuffer ? new TextDecoder().decode(obj.body) : await new Response(obj.body).text()
  const doc = JSON.parse(text) as { catalog: PublicCatalog; mediaKeys: string[] }
  return { catalog: doc.catalog, mediaKeys: doc.mediaKeys ?? [], etag: await etagOf(JSON.stringify(doc.catalog)) }
}

/**
 * Rebuilds the catalogue from the database and publishes it. A copy generated earlier never
 * replaces a newer one (two admin saves finishing out of order cannot publish stale data).
 */
export async function publishCatalog(deps: Deps): Promise<Published> {
  const fresh = await fromDatabase(deps)
  const objects = deps.objectStore()
  if (objects) {
    const key = catalogKey(deps.storeCode)
    const current = await readStored(objects, key).catch(() => null)
    if (current && current.catalog.generatedAt > fresh.catalog.generatedAt) {
      deps.log?.info('catalogue publish skipped: a newer copy exists', { current: current.catalog.generatedAt, mine: fresh.catalog.generatedAt })
      memory.set(deps.storeCode, { at: Date.now(), ttl: MEMORY_TTL_MS, value: current })
      return current
    }
    await objects.put(key, new TextEncoder().encode(JSON.stringify({ catalog: fresh.catalog, mediaKeys: fresh.mediaKeys })), { contentType: 'application/json' })
  }
  memory.set(deps.storeCode, { at: Date.now(), ttl: objects ? MEMORY_TTL_MS : NO_STORE_TTL_MS, value: fresh })
  deps.log?.info('catalogue published', { products: fresh.catalog.products.length, generatedAt: fresh.catalog.generatedAt })
  return fresh
}

/** The catalogue for public requests. Throws a 503 only if neither R2 nor the database answers. */
export async function getPublishedCatalog(deps: Deps): Promise<Published> {
  const hit = memory.get(deps.storeCode)
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value
  const objects = deps.objectStore()
  try {
    if (objects) {
      const stored = await readStored(objects, catalogKey(deps.storeCode))
      if (stored) {
        memory.set(deps.storeCode, { at: Date.now(), ttl: MEMORY_TTL_MS, value: stored })
        return stored
      }
      return await publishCatalog(deps) // first request after setup: build and publish once
    }
    const built = await fromDatabase(deps)
    memory.set(deps.storeCode, { at: Date.now(), ttl: NO_STORE_TTL_MS, value: built })
    return built
  } catch (error) {
    deps.log?.error('catalogue unavailable', { error })
    if (hit) return hit.value // serve the last good copy rather than nothing
    throw serviceUnavailable('The catalogue is temporarily unavailable. Please try again shortly.')
  }
}

export function clearCatalogMemory() {
  memory.clear()
}
