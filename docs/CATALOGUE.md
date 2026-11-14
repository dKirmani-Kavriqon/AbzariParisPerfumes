# Product catalogue and inventory

The catalogue is store-scoped data in Neon Postgres, managed through the admin API and screens.
Code lives in `src/commerce/catalog/` (business rules), `src/server/db/schema/catalog.ts`
(tables) and `src/server/api/routes.ts` (HTTP).

The storefront reads the same catalogue: see [How the shop shows the catalogue](#how-the-shop-shows-the-catalogue).

## Entities

```
stores ─┬─< products ─┬─< product_variants ──1 inventory
        │             │          └──────────< inventory_movements (append-only ledger)
        │             ├─< product_images (optional variant link)
        │             └─< product_categories >─┐
        └─< categories (parent_id → categories) ┘
```

| Table | What it holds | Key rules |
| --- | --- | --- |
| `stores` | One row per store; `code` matches `store.id` in `src/config/store.ts` | `default_currency` is an ISO 4217 code |
| `products` | Name, slug, descriptions, brand, type, status (`draft`/`active`/`archived`), featured, SEO fields | Slug unique per store; archived ⇔ `archived_at` set |
| `categories` | Nested categories via `parent_id` | Slug unique per store; max 4 levels; no loops; parent in the same store |
| `product_categories` | Product ↔ category links, ordered | Both sides must belong to the same store |
| `product_variants` | The purchasable unit: SKU, barcode, options, prices, currency, weight, dimensions | **SKU unique per store, never reused**; barcode unique per store; `sale_price_minor < price_minor` |
| `product_images` | Image records: `static` (shipped in `/public`) or `object` (R2 key), alt text, order, primary flag, size | One primary per product; a file attached once per product |
| `inventory` | One stock record per variant: available, reserved, low-stock threshold | Quantities can never be negative (CHECK) |
| `inventory_movements` | Every stock change: type, change, before, after, reason, reference, actor | `after = before + change`; UPDATE/DELETE blocked by a trigger |

### Store isolation

Every row carries `store_id`. Child rows reference their parent with a **composite foreign key**
`(store_id, parent_id) → parent(store_id, id)`, so the database refuses, for example, a variant
whose store differs from its product's, or a category link between two stores. On top of that,
every service function takes the store id and filters every query by it; an id from another
store behaves exactly like an id that does not exist (404). Both layers are tested
(`tests/catalog/inventory-isolation.test.ts`).

Each client deployment also has its own database, so isolation does not rely on this alone.

### Money

Integer minor units (`price_minor`, paise for INR) plus a currency code per variant; never
floating point. `src/commerce/catalog/money.ts` converts typed amounts with string arithmetic
(`"1,499.50"` → `149950`) and knows each currency's minor unit (INR 2, JPY 0, KWD 3). The store's
default currency comes from `src/config/store.ts`; nothing assumes INR.

### Archiving

Products, categories and variants are archived, never deleted: future orders will reference
variants, and stock history must stay complete. Archived products leave the default lists and
cannot be edited until restored (as a draft). A category with live subcategories cannot be
archived. Images are the exception: removing one deletes its record, then its file.

## Inventory logic

- **Available** is what can be sold; **reserved** is held for unpaid orders (used from the
  checkout phase); **low-stock threshold** flags a variant when available ≤ threshold.
- Every change is an `inventory_movements` row. Admin adjustment types: `restock` and `return`
  (add), `damage` (remove), `correction` (either way). `initial` is written when a variant is
  created with opening stock. `sale`, `reservation` and `release` are reserved for later phases.
  Corrections and damage require a reason.
- **Atomicity.** One SQL statement updates the stock level and inserts the ledger row from the
  update's own result. The update only applies if the result is ≥ 0, and Postgres locks the row
  while it runs, so concurrent changes queue up and each ledger row has exact before/after
  values. A request that would go negative changes nothing and returns 409. Tested with 25
  simultaneous removals against 20 in stock on real Neon: exactly 20 succeed.
- **Reconciliation.** For any variant, the sum of its movements equals its available quantity.
  The ledger cannot be edited, so mistakes are corrected with a new `correction` movement.

## Images

```
browser ──multipart──▶ POST /api/admin/products/:id/images
                         │ size ≤ 5 MB, real type from the file's bytes (JPEG/PNG/WebP/AVIF),
                         │ dimensions read from the header (≤ 8000 px), SVG and everything else refused
                         ▼
                 ObjectStore.put(key)            key = stores/<store>/products/<product>/<sha256>.<ext>
                         │                       (never the uploaded file name)
                         ▼
                 product_images row (source 'object', size, width, height, alt text)

GET /media/<key> ──▶ ObjectStore.get(key) ──▶ image with Cache-Control: immutable,
                                              nosniff, CSP sandbox; only keys this app writes
```

- `src/server/storage/object-store.ts` defines the `ObjectStore` interface (put/get/delete).
  Catalogue code never imports a provider. `r2Store()` adapts a Cloudflare R2 **Worker binding**
  (no access keys in the app); `memoryStore()` is for tests.
- No image bytes are stored in Postgres.
- Images that already ship with the site (`/public/products/*.webp`) are registered as
  `static` images and need no storage at all. The seeded catalogue uses these.
- The browser-declared MIME type and file name are ignored; a "PNG" that is really an executable
  or HTML is refused.
- Deleting removes the database row first, then the file, so the site never links to a missing
  file. A leftover file (if the bucket was unreachable) is logged for cleanup.

### Enabling uploads (R2)

**Status (preview): enabled.** Private bucket `abzari-paris-media` (APAC), bound as `MEDIA_BUCKET`;
no public r2.dev address or custom domain. For another deployment:

1. Cloudflare dashboard → R2 → enable R2 (the free tier: 10 GB storage, 1M writes and 10M reads a
   month; Cloudflare may ask for a payment method even for free usage).
2. Create a bucket, e.g. `abzari-paris-media` (keep it private; the Worker serves files).
3. Add to `wrangler.jsonc`:
   `"r2_buckets": [{ "binding": "MEDIA_BUCKET", "bucket_name": "abzari-paris-media" }]`
4. Deploy. Uploads then work with no code change.

Expected use for this store: well under 1 GB, a few hundred writes and tens of thousands of
reads a month: inside the free tier.

## How the shop shows the catalogue

```
admin save ──▶ database ──▶ publish: public catalogue JSON ──▶ R2 stores/<store>/catalog/public.json
                (in the same request, ~1 s)                        │
                                                                   ▼
shopper ──▶ pre-built page (HTML baked from the catalogue at build) ──▶ browser loads /api/catalog
            ~2–3 ms Worker CPU, no database                            (memory → R2; ETag/304)
```

- **Public catalogue** (`src/commerce/catalog/public.ts`, built by `public-build.ts`): live
  products only (status *active*, not archived), active variants, visible categories. Each
  variant has its prices and an **availability status** (`in_stock`, `low_stock`,
  `out_of_stock`), never the stock count. Products with no variant are `coming_soon`. No
  database ids, reserved quantities, thresholds or admin data are included. Read in a single
  transaction, so it is consistent even while the admin is saving.
- **Publishing**: every successful admin change (product, variant, stock, image, category)
  republishes it to R2. A copy read earlier never overwrites a newer one. Admin → Overview or
  `POST /api/admin/catalog/publish` republishes manually.
- **Shoppers never wake the database.** `/api/catalog` and the Worker read the published copy
  (memory for 10 s, then R2). Only if R2 has no copy is it built from the database (and stored).
- **Pre-rendered pages**: `next build` bakes the catalogue into the HTML (from `DATABASE_URL`
  locally, or the live `/api/catalog` in CI via `CATALOG_SOURCE_URL`), so search engines and first
  paint see real products. The browser then loads the live catalogue and updates prices,
  availability and listings in place. A daily rebuild refreshes the baked HTML.
- **New and archived products between builds**: `worker.ts` checks `/product/<slug>` against the
  live catalogue. Archived products get the 404 page even though their pre-built page exists;
  products added since the build are served by the pre-built `/product-view` page, which renders
  the product from the live catalogue at its own address. Nothing renders on demand.
- **Shop**: categories (top-level tabs, subcategory tabs, `?c=<slug>`, old `?c=parfum` links still
  work), search (`?q=`; name, brand, notes, size, SKU), "in stock only", sorting. Search runs on the
  published catalogue in the browser: instant, and no database queries per keystroke.
- **Stock display**: sold-out products keep their price and show "Sold out" with no Add to bag;
  low stock shows "Only a few left". The storefront never changes or reserves stock.

### Freshness

| Change in the admin | Visible in the shop |
| --- | --- |
| Price, sale price, stock, availability | On the next page load (seconds) |
| New product, new photo, archive/unpublish | On the next page load; the product page itself works immediately via the live page |
| Text/SEO in the pre-rendered HTML (what search engines read) | Next daily rebuild or deploy |

## Limitations

- Search engines see catalogue changes after the next daily rebuild (shoppers see them at once).
- Rawah and Voyage cards now use their primary photo (the old site used a different card photo
  than the product page). Choose another primary photo in the admin to change it.
- Admin access on deployed Workers needs Cloudflare Access (configured for the preview; see
  `docs/DEPLOYMENT.md`).
- Search is a case-insensitive substring match (fine for hundreds of products). Postgres
  full-text search can replace it if a store grows large.
- No bulk import/export yet.
