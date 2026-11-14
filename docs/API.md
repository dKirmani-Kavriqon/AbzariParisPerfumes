# API

Served by the router in `src/server/api/routes.ts`. On Cloudflare the custom Worker
(`worker.ts`) answers `/api/*` and `/media/*` before Next.js runs; `next dev` uses the same
router through `src/app/api/[...path]/route.ts`.

## Conventions

- Success: `{ "ok": true, "data": … }`. Failure: `{ "ok": false, "error": { "code", "message", "details"?, "requestId" } }`.
- `details` on 409/422 maps field names to messages, e.g. `{ "sku": "This SKU is already used in this store." }`.
  Nested fields use dots: `variants.0.priceMinor`.
- Status codes: 400 malformed, 401 not signed in, 403 not allowed, 404 not found (also for
  another store's ids), 405 wrong method (`Allow` header), 409 conflict (duplicate slug/SKU,
  stock would go negative, archived item), 413 too large, 415 wrong content type, 422 invalid
  input, 503 a dependency is unavailable (database, storage, store not seeded), 500 unexpected.
- Money: integers in minor units (`priceMinor: 150000` = ₹1,500.00). Ids: UUIDs.
- JSON bodies are limited to 32 KB (128 KB for product creation); images to 5 MB.
- Responses carry `Cache-Control: no-store` (except `/media`), `x-request-id` and the site's security headers.

## Admin access

Every `/api/admin/*` call requires an admin (see `src/server/auth/admin.ts`):

- Deployed: a valid Cloudflare Access JWT (`Cf-Access-Jwt-Assertion` header or `CF_Authorization`
  cookie), verified for signature, audience, issuer and expiry; optional `ADMIN_EMAILS` allowlist.
- Local: `APP_ENV=development` + `ADMIN_LOCAL_DEV=1`, on localhost only.
- Writes (POST/PUT/PATCH/DELETE) must also send `X-Requested-With: kce-admin`, and any `Origin`
  header must be the site itself. This blocks cross-site request forgery.

## Endpoints

### Public

Read-only, served from the published catalogue (never the database directly), store-scoped, and
limited to public fields (no ids, no stock counts). Parameters are validated (422 otherwise).

| Method | Path | |
| --- | --- | --- |
| GET | `/api/health` | Status and configuration. `?checks=db` with `x-health-token` also checks the database |
| GET | `/api/catalog` | The whole public catalogue. `ETag` + `If-None-Match` → 304; `Cache-Control: public, max-age=0, must-revalidate` |
| GET | `/api/catalog/products` | `q`, `category` (slug, includes subcategories; or `coming-soon`), `availability` (`all`/`available`), `sort` (`featured`, `price-asc`, `price-desc`, `name`), `limit` ≤100, `offset` |
| GET | `/api/catalog/products/:slug` | One live product, or 404 |
| GET | `/api/catalog/categories` | Visible categories with their parent slug |
| GET | `/media/<key>` | An uploaded image, **only** if it belongs to this store and to a product that is live in the published catalogue; `Cache-Control: public, max-age=86400` |

### Cart

| Method | Path | |
| --- | --- | --- |
| POST | `/api/cart/quote` | Prices and checks a bag against the database. Body `{ "items": [{ "sku": "ABZ-RAWAH", "quantity": 2 }] }` (strict: no other fields; ≤20 items; quantity 1–10; ≤4 KB). Returns `{ currency, lines: [{ sku, quantity, status, maxQuantity, product, unitPriceMinor, compareAtMinor, lineTotalMinor }], subtotalMinor, itemCount, canCheckout, checkedAt }`. `status`: `ok`, `insufficient_stock`, `sold_out`, `unavailable`. Read-only, `no-store`. 422 invalid body, 413 too large, 415 not JSON, 503 database unavailable. See [CART.md](CART.md) |

### Storefront publishing

| Method | Path | |
| --- | --- | --- |
| GET | `/api/admin/catalog/status` | When the live catalogue was published, product count, storage |
| POST | `/api/admin/catalog/publish` | Republish now (every successful admin write already republishes; responses carry `x-catalog-published`) |
| GET | `/api/admin/media/<key>` | Any of this store's uploaded images, including drafts (admin only) |

### Session

| GET | `/api/admin/session` | Who is signed in, and the store (code, name, currency) |
| --- | --- | --- |

### Products

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/api/admin/products` | `q` (name, slug, brand, SKU), `status` (`current` default, `draft`, `active`, `archived`, `all`), `categoryId`, `featured`, `limit` (≤100), `offset` |
| POST | `/api/admin/products` | `name`, optional `slug` (made from the name), `shortDescription`, `fullDescription`, `brand`, `productType`, `status` (`draft`/`active`), `featured`, `seoTitle` (≤70), `seoDescription` (≤160), `categoryIds[]`, `variants[]` (as below). One transaction. → 201 |
| GET | `/api/admin/products/:id` | Product with categories, variants (with stock) and images |
| PATCH | `/api/admin/products/:id` | Any product field above (not `archived`; use archive) |
| POST | `/api/admin/products/:id/archive` | Archive (nothing is deleted) |
| POST | `/api/admin/products/:id/restore` | Restore as a draft |
| PUT | `/api/admin/products/:id/categories` | `{ "categoryIds": [...] }` replaces the product's categories, in order |

### Variants and SKUs

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/api/admin/products/:id/variants` | Variants with stock |
| POST | `/api/admin/products/:id/variants` | `sku`, `priceMinor`, optional `salePriceMinor` (< price), `currency` (defaults to the store's), `title`, `options` (≤5 name→value), `barcode`, `weightGrams`, `lengthMm`/`widthMm`/`heightMm`, `status` (`active`/`inactive`), `initialStock`, `lowStockThreshold` → 201 |
| GET | `/api/admin/variants/:id` | One variant with stock |
| PATCH | `/api/admin/variants/:id` | Any variant field except stock (sale < regular checked against stored values) |
| POST | `/api/admin/variants/:id/archive` | Archive |
| GET | `/api/admin/skus/availability` | `sku`, optional `excludeVariantId` → `{ sku, available }` |

### Inventory

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/api/admin/inventory` | Current variants' stock. `lowStock=true`, `q`, `limit` (≤200), `offset` |
| GET | `/api/admin/variants/:id/inventory` | `{ stock, movements }` (newest first), `limit` ≤200 |
| POST | `/api/admin/variants/:id/inventory/adjustments` | `type` (`restock`/`return` > 0, `damage` < 0, `correction` ≠ 0), `quantityChange`, `reason` (required for damage and corrections), `reference` → 201 `{ movementId, previousQuantity, resultingQuantity, stock }`; 409 if stock would go below zero |
| PUT | `/api/admin/variants/:id/inventory/threshold` | `{ "lowStockThreshold": n }` |

### Images

| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/admin/products/:id/images` | Images, primary first |
| POST | `/api/admin/products/:id/images` | `multipart/form-data`: `file` (JPEG/PNG/WebP/AVIF ≤5 MB), `altText`, `variantId`. Or JSON `{ "source": "static", "path": "/products/x.webp", "altText" }` for a photo shipped with the site → 201. 503 if no bucket is bound |
| PUT | `/api/admin/products/:id/images/order` | `{ "imageIds": [...] }`: every image exactly once |
| PATCH | `/api/admin/images/:id` | `altText` (≤250), `variantId` |
| POST | `/api/admin/images/:id/primary` | Make primary |
| DELETE | `/api/admin/images/:id` | Remove the record, then the stored file |

### Categories

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/api/admin/categories` | Flat list with `parentId` and `productCount`; `includeArchived=true` |
| POST | `/api/admin/categories` | `name`, optional `slug`, `description`, `parentId`, `imageRef`, `status` (`active`/`hidden`), `position` → 201 |
| PATCH | `/api/admin/categories/:id` | Any field above (loops and >4 levels refused) |
| POST | `/api/admin/categories/:id/archive` | Refused while it has live subcategories |
| POST | `/api/admin/categories/:id/restore` | Refused while its parent is archived |
