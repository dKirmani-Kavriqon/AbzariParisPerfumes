/**
 * Checks that DATABASE_URL works end to end without touching commerce data:
 *   1. connectivity and latency (`select 1`)
 *   2. migration state
 *   3. a write and read-back inside one transaction on the app_meta table, then the same
 *      row is deleted in that transaction, so nothing is left behind.
 *
 *   npm run db:verify
 */
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}
const sql = neon(url)

let t = Date.now()
const [{ version }] = (await sql`select version() as version`) as { version: string }[]
console.log(`connect      ok  ${Date.now() - t} ms (includes waking the compute if it was asleep)`)
t = Date.now()
await sql`select 1`
console.log(`round trip   ok  ${Date.now() - t} ms  ${version.split(' ').slice(0, 2).join(' ')}`)

const migrations = (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`.catch(() => [{ n: -1 }])) as { n: number }[]
console.log(`migrations   ${migrations[0].n >= 0 ? `${migrations[0].n} applied` : 'none yet (run npm run db:migrate)'}`)

const key = `verify:${crypto.randomUUID()}`
const value = { at: new Date().toISOString() }
const [, readBack, , after] = await sql.transaction([
  sql`insert into app_meta (key, value) values (${key}, ${JSON.stringify(value)}::jsonb)`,
  sql`select value from app_meta where key = ${key}`,
  sql`delete from app_meta where key = ${key}`,
  sql`select count(*)::int as n from app_meta where key = ${key}`,
])
const wrote = (readBack as { value: { at: string } }[])[0]?.value.at === value.at
const cleaned = (after as { n: number }[])[0]?.n === 0
console.log(`read/write   ${wrote && cleaned ? 'ok' : 'FAILED'}  (inserted, read back and deleted one app_meta row in a transaction)`)
process.exit(wrote && cleaned ? 0 : 1)
