/**
 * Applies pending Drizzle migrations from ./drizzle to the database in DATABASE_URL.
 *
 *   npm run db:migrate            # dry run: lists pending migrations, changes nothing
 *   npm run db:migrate -- --apply # applies them
 *
 * Each migration runs inside a single transaction together with its bookkeeping row, so a
 * failed migration leaves the database exactly as it was. (drizzle-orm's own neon-http
 * migrator runs statements one by one, which can leave a half-applied migration.)
 * Compatible with drizzle-kit's journal and the drizzle.__drizzle_migrations table.
 *
 * Run it against a Neon branch first, then production. See docs/DATABASE.md.
 */
import { neon } from '@neondatabase/serverless'
import { readMigrationFiles } from 'drizzle-orm/migrator'

const apply = process.argv.includes('--apply')
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Put it in .env.local (never commit it) or export it for this command.')
  process.exit(1)
}

const sql = neon(url)
const target = new URL(url)
// Show which endpoint we are about to touch, without the credentials.
console.log(`Target: ${target.hostname.split('.')[0]} / ${target.pathname.slice(1)}`)

await sql`create schema if not exists drizzle`
await sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`
const [last] = (await sql`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`) as { created_at: string }[]
const lastApplied = last ? Number(last.created_at) : 0

const migrations = readMigrationFiles({ migrationsFolder: 'drizzle' })
const pending = migrations.filter((m) => m.folderMillis > lastApplied)

if (pending.length === 0) {
  console.log('No pending migrations.')
  process.exit(0)
}
console.log(`Pending: ${pending.length}`)
for (const m of pending) console.log(`  - ${new Date(m.folderMillis).toISOString()}  ${m.hash.slice(0, 12)}  (${m.sql.length} statements)`)

if (!apply) {
  console.log('Dry run. Re-run with --apply to apply these migrations.')
  process.exit(0)
}

for (const m of pending) {
  await sql.transaction([
    // Serialises concurrent runs: a second runner waits, then fails on the duplicate DDL and rolls back.
    sql`select pg_advisory_xact_lock(4823190571)`,
    ...m.sql.filter((s) => s.trim()).map((s) => sql.query(s)),
    sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.folderMillis})`,
  ])
  console.log(`Applied ${m.hash.slice(0, 12)}`)
}
console.log('Done.')
