import 'server-only'
import { store } from '../../config/store'
import { buildPublicCatalog } from '../../commerce/catalog/public-build'
import { emptyCatalog, type PublicCatalog } from '../../commerce/catalog/public'
import { resolveStore } from '../../commerce/catalog/store'
import { getDb } from '../db/client'
import type { Db } from '../db/types'

/*
 * The catalogue baked into pre-rendered pages at build time (`next build`), so the HTML that
 * search engines and first page loads see already lists the products. Browsers then load the
 * live published catalogue (CatalogProvider), so anything changed after the build still shows.
 *
 * Source, in order:
 *   1. DATABASE_URL  — read the database directly (local builds, or CI with database access);
 *   2. CATALOG_SOURCE_URL — the live site's /api/catalog (CI deploys; no secrets needed);
 *   3. nothing — an empty catalogue, with a warning; pages fill in from the live catalogue.
 * CATALOG_REQUIRED=1 turns a failed source into a build error instead.
 */
let loading: Promise<PublicCatalog> | undefined

export function getBuildCatalog(): Promise<PublicCatalog> {
  return (loading ??= load())
}

async function load(): Promise<PublicCatalog> {
  const required = process.env.CATALOG_REQUIRED === '1'
  try {
    if (process.env.DATABASE_URL) {
      const db = getDb() as unknown as Db
      const { catalog } = await buildPublicCatalog(db, await resolveStore(db, store.id))
      return catalog
    }
    const source = process.env.CATALOG_SOURCE_URL
    if (source) {
      const res = await fetch(source, { cache: 'force-cache' })
      const body = (await res.json()) as { ok: boolean; data?: PublicCatalog }
      if (!res.ok || !body.ok || body.data?.schema !== 1 || body.data.store !== store.id) throw new Error(`catalogue source answered ${res.status}`)
      return body.data
    }
    throw new Error('no catalogue source (set DATABASE_URL or CATALOG_SOURCE_URL)')
  } catch (error) {
    if (required) throw error
    console.warn(`[catalogue] building without products: ${(error as Error).message}. Pages will load the live catalogue in the browser.`)
    return emptyCatalog(store.id, store.currency)
  }
}
