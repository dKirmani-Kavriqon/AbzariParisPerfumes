# Testing

```bash
npm test                      # all unit and integration tests (Vitest)
npm run typecheck && npm run lint
npm run build:worker && npm run check:bundle -- .open-next/assets
```

## Integration tests and the database

Catalogue and API tests run against a **real Postgres**:

- **By default, PGlite**: Postgres compiled to WebAssembly, running in the test process. Each
  test file starts an empty database and applies every migration in `drizzle/`, so migrations
  are tested too. No network, no secrets: this is what CI runs.
- **Against Neon**, by setting `TEST_DATABASE_URL` to a throwaway Neon branch that has the
  migrations applied. This exercises Neon's HTTP driver, batched transactions and real
  concurrency (PGlite runs one query at a time). Never point it at production.

```bash
neon branches create --project-id mute-math-91528715 --name test-$(whoami) --parent production
export DATABASE_URL="$(neon connection-string test-$(whoami) --project-id mute-math-91528715)"
npm run db:migrate -- --apply
TEST_DATABASE_URL="$DATABASE_URL" npx vitest run tests/catalog tests/api --testTimeout=120000
neon branches delete test-$(whoami) --project-id mute-math-91528715
```

Every test creates its own uniquely named stores, so tests never see each other's data and can
run against a shared branch.

## What is covered

| Area | File |
| --- | --- |
| Money parsing/formatting, slugs | `tests/catalog/money.test.ts` |
| Products (create, update, archive/restore, duplicate slugs, search, list summary), categories (nesting, loops, depth, archive rules, assignment), variants and SKUs (duplicates within and across stores, price rules in schema, service and database), transaction rollback | `tests/catalog/products.test.ts` |
| Inventory (adjustments, movement history, negative stock, concurrency, thresholds, append-only ledger), images (primary, order, delete, sharing), **store isolation** (service and database level) | `tests/catalog/inventory-isolation.test.ts` |
| Image upload validation (real photos, all formats, executables, SVG/HTML, limits, safe keys) | `tests/storage/image-validation.test.ts` |
| Admin access (fail closed, local switch, CSRF, Cloudflare Access JWT checks), full catalogue API over HTTP including uploads and `/media` | `tests/api/admin-api.test.ts` |
| Health endpoint, router errors and headers | `tests/api/health.test.ts` |
| Environment validation, logging redaction, API conventions | `tests/server/*.test.ts` |

## Browser checks

Playwright scripts (not in CI) compare the storefront with the Phase 1 baseline and walk through
the admin: product list and search, create category and product with variant, validation
messages, duplicate SKU, editing, image upload, ordering and primary, stock adjustments and
history, archive/restore, phone layouts. Run the admin locally with:

```bash
cp .env.example .env.local    # DATABASE_URL = a Neon dev branch, APP_ENV=development, ADMIN_LOCAL_DEV=1
npm run dev                   # http://localhost:3000/admin
```
