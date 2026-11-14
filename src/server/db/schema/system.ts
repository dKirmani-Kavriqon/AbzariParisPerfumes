import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Key/value settings that belong to the platform rather than to commerce, for example the
 * last successful database verification. Commerce tables arrive in later phases, each in
 * its own file in this folder.
 */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
