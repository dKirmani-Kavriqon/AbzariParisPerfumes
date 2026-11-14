import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type * as schema from './schema'

/**
 * The database handle every service receives. It is the driver-neutral Drizzle type, so the
 * same service code runs on Neon's HTTP driver in production and on PGlite in tests.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
