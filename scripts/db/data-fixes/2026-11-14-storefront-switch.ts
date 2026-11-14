/**
 * One-off catalogue fixes approved for the switch to the database storefront (Phase 3A, 14 Nov 2026):
 *   1. "Bakhoor" and "Natural Oils" were "Coming soon" on the old site. Seeded as drafts, they would
 *      vanish; make them live (they have no variants, so the shop shows them as "Coming soon").
 *   2. Archive the leftover test product "test brand" (SKU "zak") so it never reaches the shop.
 * Stock is deliberately not touched: zero-stock perfumes show as sold out until real counts are entered.
 *
 *   node scripts/db/data-fixes/2026-11-14-storefront-switch.ts            # dry run
 *   node scripts/db/data-fixes/2026-11-14-storefront-switch.ts --apply
 */
import { neon } from '@neondatabase/serverless'

const apply = process.argv.includes('--apply')
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const sql = neon(url)
console.log(`Target: ${new URL(url).hostname.split('.')[0]} (${apply ? 'APPLY' : 'dry run'})`)

const comingSoon = (await sql`
  select p.id, p.slug, p.status from products p join stores s on s.id = p.store_id and s.code = 'abzari-paris'
   where p.slug in ('bakhoor', 'natural-oils') and p.archived_at is null
     and not exists (select 1 from product_variants v where v.product_id = p.id and v.archived_at is null)`) as { id: string; slug: string; status: string }[]
for (const p of comingSoon) console.log(`  coming soon: ${p.slug} (${p.status} → active)`)

const testProducts = (await sql`
  select p.id, p.name, p.slug from products p join stores s on s.id = p.store_id and s.code = 'abzari-paris'
   where p.archived_at is null and lower(p.name) = 'test brand'
     and exists (select 1 from product_variants v where v.product_id = p.id and v.sku = 'zak')`) as { id: string; name: string; slug: string }[]
for (const p of testProducts) console.log(`  archive: "${p.name}" (/${p.slug})`)

if (!apply) process.exit(0)
const statements = [
  ...comingSoon.filter((p) => p.status !== 'active').map((p) => sql`update products set status = 'active', updated_at = now() where id = ${p.id} and archived_at is null`),
  ...testProducts.map((p) => sql`update products set status = 'archived', archived_at = now(), featured = false, updated_at = now() where id = ${p.id} and archived_at is null`),
]
if (statements.length) await sql.transaction(statements)
console.log(`Applied ${statements.length} change(s).`)
