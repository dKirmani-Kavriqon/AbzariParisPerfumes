/**
 * Loads this deployment's store and its existing catalogue (src/data/products.ts) into the
 * database. Safe to re-run: products whose slug already exists are skipped, never overwritten,
 * so edits made in the admin are kept.
 *
 *   npm run db:seed              # dry run: shows what would be created
 *   npm run db:seed -- --apply
 *
 * Mapping from the storefront data:
 * - The site shows `price` with `compareAt` struck through. In the database the regular price is
 *   `compareAt` and the sale price is `price`; without compareAt, `price` is the regular price.
 * - One variant per product, SKU "ABZ-<SLUG>", labelled with the product's size.
 * - "Coming soon" products (no price) are live without variants, so the shop shows them as "Coming soon".
 * - Stock starts at 0: real counts are entered in the admin (each change is recorded).
 */
import { neon } from '@neondatabase/serverless'
import { store } from '../../src/config/store.ts'
import { products, type Category } from './data/abzari-products.ts'

const apply = process.argv.includes('--apply')
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}
const sql = neon(url)
console.log(`Target: ${new URL(url).hostname.split('.')[0]}  store: ${store.id}  (${apply ? 'APPLY' : 'dry run'})`)

const categoryDefs: Record<Category, { name: string; slug: string; type: string; position: number }> = {
  parfum: { name: 'Eau de Parfum', slug: 'eau-de-parfum', type: 'eau-de-parfum', position: 0 },
  oil: { name: 'Perfume Oils', slug: 'perfume-oils', type: 'perfume-oil', position: 1 },
  bakhoor: { name: 'Bakhoor', slug: 'bakhoor', type: 'bakhoor', position: 2 },
  natural: { name: 'Natural Oils', slug: 'natural-oils', type: 'natural-oil', position: 3 },
}
const featured = new Set(['rawah', 'voyage'])
const toMinor = (rupees: number) => Math.round(rupees * 100) // catalogue prices are whole rupees

if (apply) {
  await sql`insert into stores (code, name, default_currency) values (${store.id}, ${store.name}, ${store.currency}) on conflict (code) do nothing`
}
const [storeRow] = (await sql`select id from stores where code = ${store.id}`) as { id: string }[]
if (!storeRow && !apply) {
  console.log(`Would create store "${store.id}", 4 categories and ${products.length} products.`)
  process.exit(0)
}
const storeId = storeRow.id

const categoryIds: Partial<Record<Category, string>> = {}
for (const [key, def] of Object.entries(categoryDefs) as [Category, (typeof categoryDefs)[Category]][]) {
  if (apply) {
    await sql`insert into categories (store_id, name, slug, position) values (${storeId}, ${def.name}, ${def.slug}, ${def.position}) on conflict (store_id, slug) do nothing`
  }
  const [row] = (await sql`select id from categories where store_id = ${storeId} and slug = ${def.slug}`) as { id: string }[]
  if (row) categoryIds[key] = row.id
}

let created = 0
let skipped = 0
for (const p of products) {
  const details = p.notes ? { notes: p.notes } : {}
  const [exists] = (await sql`select id, details from products where store_id = ${storeId} and slug = ${p.slug}`) as { id: string; details: Record<string, unknown> }[]
  if (exists) {
    skipped++
    // Fill in fragrance notes for products that have none yet; never overwrite admin edits.
    if (p.notes && Object.keys(exists.details ?? {}).length === 0) {
      console.log(`  ~ ${p.slug.padEnd(18)} add fragrance notes`)
      if (apply) await sql`update products set details = ${JSON.stringify(details)}::jsonb, updated_at = now() where id = ${exists.id} and details = '{}'::jsonb`
    }
    continue
  }
  created++
  const def = categoryDefs[p.category]
  const hasPrice = !p.soldOut && p.price > 0
  console.log(`  + ${p.slug.padEnd(18)} ${hasPrice ? `${p.compareAt ?? p.price} / sale ${p.compareAt ? p.price : '-'} INR` : 'coming soon (no variant)'}`)
  if (!apply) continue

  const productId = crypto.randomUUID()
  const variantId = crypto.randomUUID()
  const images = p.gallery ?? (p.image ? [p.image] : [])
  const statements = [
    sql`insert into products (id, store_id, name, slug, short_description, full_description, brand, product_type, status, featured, details)
        values (${productId}, ${storeId}, ${p.name}, ${p.slug}, ${p.size}, ${p.description ?? null}, ${'Abzari Paris'}, ${def.type}, ${'active'}, ${featured.has(p.slug)}, ${JSON.stringify(details)}::jsonb)`,
  ]
  if (categoryIds[p.category]) statements.push(sql`insert into product_categories (store_id, product_id, category_id) values (${storeId}, ${productId}, ${categoryIds[p.category]!})`)
  if (hasPrice) {
    const regular = toMinor(p.compareAt ?? p.price)
    const sale = p.compareAt ? toMinor(p.price) : null
    statements.push(
      sql`insert into product_variants (id, store_id, product_id, sku, title, price_minor, sale_price_minor, currency)
          values (${variantId}, ${storeId}, ${productId}, ${`ABZ-${p.slug.toUpperCase()}`}, ${p.size}, ${regular}, ${sale}, ${store.currency})`,
      sql`insert into inventory (store_id, variant_id, available_quantity, low_stock_threshold) values (${storeId}, ${variantId}, 0, 2)`,
    )
  }
  images.forEach((path, i) => {
    statements.push(
      sql`insert into product_images (store_id, product_id, source, storage_key, alt_text, position, is_primary)
          values (${storeId}, ${productId}, 'static', ${path}, ${`${p.name} by Abzari Paris`}, ${i}, ${i === 0})`,
    )
  })
  await sql.transaction(statements)
}
console.log(`${apply ? 'Created' : 'Would create'} ${created} product(s); ${skipped} already present.`)
