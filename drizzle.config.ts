import { defineConfig } from 'drizzle-kit'

// Migrations are generated from src/server/db/schema into ./drizzle and reviewed in pull
// requests. Applying them is a separate, deliberate step (npm run db:migrate); see
// docs/DATABASE.md.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  // Neon Auth keeps its own tables in the neon_auth schema; never touch them.
  schemaFilter: ['public'],
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
})
