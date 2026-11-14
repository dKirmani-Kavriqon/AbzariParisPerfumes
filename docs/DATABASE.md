# Database

Neon Postgres (free plan), accessed with Drizzle ORM through Neon's HTTPS driver
(`@neondatabase/serverless` + `drizzle-orm/neon-http`).

## Current state

| | |
| --- | --- |
| Neon project | `abzari-paris` (`mute-math-91528715`), org "Abzari", region `aws-ap-southeast-1` (Singapore), Postgres 18 |
| Branch | `production` (the only branch) |
| Compute | autoscaling 0.25–1 CU, scales to zero after 5 minutes idle |
| Data API | **Off** (removed in Phase 1; all access goes through the Worker) |
| Neon Auth | On, kept for admin login in Phase 5. Its tables live in the `neon_auth` schema, which Drizzle never touches (`schemaFilter: ['public']`) |
| App tables | `app_meta`; catalogue: `stores`, `products`, `categories`, `product_categories`, `product_variants`, `product_images`, `inventory`, `inventory_movements` (see [CATALOGUE.md](CATALOGUE.md)) |
| Migrations applied | `0000_foundation`, `0001_catalogue` (Phase 2), `0002_product-details` (Phase 3A: `products.details` for fragrance notes); all additive |
| Seeded | Store `abzari-paris`, 4 categories, 21 products from `scripts/db/data/abzari-products.ts` (`npm run db:seed`) |

## Why the HTTP driver and not Hyperdrive

| | Neon HTTP driver | Cloudflare Hyperdrive |
| --- | --- | --- |
| Extra infrastructure | None | A Hyperdrive config per client |
| Free-plan limit | None on the Cloudflare side | 100,000 queries per day, then queries fail |
| Connection handling | One HTTPS request per query or transaction batch; nothing to pool | TCP pooling near the database |
| Interactive transactions | No (batched transactions only) | Yes |
| Latency | A round trip per query | Lower for many sequential queries |

For a small store the HTTP driver is the simpler and safer default: no daily cap, no extra
service, and batched transactions (`sql.transaction([...])` / `db.batch([...])`) cover order
creation. Revisit Hyperdrive if a feature needs interactive transactions or many sequential
queries per request.

## Connection strings

- **Worker (runtime):** the *pooled* connection string, stored as the Worker secret `DATABASE_URL`.
- **Local development:** `.env.local` (git-ignored), ideally pointing at a Neon development branch.
- Get one without printing it into shared logs:
  `neon connection-string <branch> --project-id mute-math-91528715 --pooled`

## Changing the schema safely

1. Edit or add a schema file in `src/server/db/schema/` (one file per commerce module) and export
   it from `schema/index.ts`.
2. `npm run db:generate -- --name <what-changed>` writes SQL to `drizzle/`. **Read the SQL.**
3. Commit the schema change and the migration in the same pull request. CI runs
   `drizzle-kit check` to catch a missing or inconsistent migration.
4. Test on a Neon branch first:
   ```bash
   neon branches create --project-id mute-math-91528715 --name try-<change> --parent production
   DATABASE_URL="$(neon connection-string try-<change> --project-id mute-math-91528715)" npm run db:migrate            # dry run
   DATABASE_URL="$(neon connection-string try-<change> --project-id mute-math-91528715)" npm run db:migrate -- --apply
   DATABASE_URL="$(neon connection-string try-<change> --project-id mute-math-91528715)" npm run db:verify
   ```
5. After the pull request is approved, apply to `production` the same way, then delete the test branch.

### Rules

- `scripts/db/migrate.ts` applies each migration **in one transaction** together with its
  bookkeeping row, so a failed migration leaves nothing behind. (Drizzle's own neon-http migrator
  runs statements one at a time; don't use `drizzle-kit migrate` or `push` against production.)
- It is a dry run unless `--apply` is passed, and prints which endpoint it is about to touch.
- Never edit a migration that has been applied anywhere; add a new one.
- Make changes backwards compatible (expand, then contract): add a nullable column, deploy code
  that writes it, backfill, then make it required in a later migration. The running Worker and
  the database are never updated at exactly the same moment.
- Run one migration process at a time (an advisory lock serialises concurrent runs).

## Seeding a store

`npm run db:seed` (dry run) / `npm run db:seed -- --apply` creates the store row for
`src/config/store.ts` and loads `scripts/db/data/abzari-products.ts`. It only adds products whose slug is
not in the database yet, so it never overwrites admin edits (fragrance notes are filled in only where a
product has none). Stock starts at 0: products show "Sold out" until stock is entered in the admin.

## One-off data fixes

Recorded in `scripts/db/data-fixes/` (dry run by default, `--apply` to run). 2026-11-14: Bakhoor and
Natural Oils made live as "Coming soon"; the test product "test brand" archived.

## Backups

See [BACKUPS.md](BACKUPS.md): Neon point-in-time restore (6 hours) plus a nightly verified dump to R2.
