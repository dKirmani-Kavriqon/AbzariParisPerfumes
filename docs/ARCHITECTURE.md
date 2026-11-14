# Architecture

## Shape of the system

```
Browser
  │  HTML, JS, CSS, images
  ▼
Cloudflare Worker  (worker.ts; one per client per environment, free plan)
  ├─ Static assets: /_next/static, /products, /notes                         ← no Worker CPU
  ├─ /api/*, /media/*  →  API router (src/server/api), skipping Next.js
  │    ├─ src/server/http (validation, errors, logging) and src/server/auth (admin boundary)
  │    ├─ src/commerce/catalog (business rules)  →  src/server/db  →  Neon Postgres over HTTPS
  │    └─ src/server/storage (ObjectStore)  →  R2 binding (when enabled)
  ├─ /admin/*  →  only for a verified admin, otherwise the 404 page
  ├─ /product/<slug>  →  checked against the published catalogue (404 if archived; live page if newer than the build)
  ├─ everything else  →  Next.js via OpenNext (pre-rendered pages, data baked in at build)
  └─ Worker secrets: DATABASE_URL, HEALTH_CHECK_TOKEN, ADMIN_EMAILS (later: payment and email keys)
```

Catalogue for shoppers: admin write → database → published JSON in R2 → `/api/catalog` → browser
(see [CATALOGUE.md](CATALOGUE.md#how-the-shop-shows-the-catalogue)).

Bag: SKUs and quantities in the browser's localStorage → `POST /api/cart/quote` → prices, stock and
subtotal from the database (see [CART.md](CART.md)).

Pages are pre-rendered at build time wherever possible. On the free Workers plan a request may
use 10 ms of CPU, so pages that can be static must stay static; server rendering is reserved
for what genuinely changes per request (cart totals, orders, admin).

## Layers and the rules between them

| Folder | Holds | May import |
| --- | --- | --- |
| `src/app/` | Routes: `(store)/` storefront pages, `admin/` admin pages, `api/` and `media/` adapters. Thin. | everything below |
| `src/views/` | Page bodies (`admin/` holds the admin screens) | components, config, data, state, `src/commerce/catalog` browser-safe helpers |
| `src/components/`, `src/three/` | UI | config, data, state |
| `src/state/` | Browser state: the bag (`cart.ts`, SKUs and quantities in localStorage, priced by the server) and the live catalogue (`catalog.tsx`) | commerce browser-safe helpers |
| `src/config/` | Public per-client settings, security headers | nothing app-specific |
| `src/types/` | Types shared by browser and server | nothing |
| `src/commerce/` | Reusable business rules (see its README) | `src/server/db`, `src/server/http/errors`, types |
| `src/server/` | Server-only: env, db, http conventions, logging, integrations | config, types |

`src/server/**` files that touch secrets start with `import 'server-only'`, so the build fails if
browser code imports them. CI also scans the built browser files for secret names, connection
strings and database code (`npm run check:bundle`).

## API conventions

Every route handler is wrapped in `route()` from `src/server/http/route.ts`:

- **Response shape:** `{ ok: true, data }` or `{ ok: false, error: { code, message, details?, requestId } }`.
- **Status codes:** 400 malformed, 401/403 auth, 404 missing, 405 wrong method (with `Allow`),
  413 body too large, 415 wrong content type, 422 validation failed (`details` holds field errors),
  503 a dependency is down, 500 anything unexpected.
- **Errors:** throw an `AppError` (helpers in `errors.ts`). Anything else becomes a generic 500;
  the real error goes to the log, never to the caller. Configuration problems are logged by
  variable name only.
- **Validation:** zod schemas with `parseJsonBody` (content-type check, 32 KB default limit
  enforced while reading) and `parseQuery`.
- **Caching:** API responses are `Cache-Control: no-store` unless a route opts in.
- **Request id:** `x-request-id` on every response (Cloudflare's ray id when present) and on every log line.
- **Logging:** one JSON line per request via `src/server/log.ts`. Keys that look like credentials
  or personal data are redacted, as are connection strings and API keys found inside text.
- Unknown `/api/*` paths return the JSON 404, not the HTML page.

## Security baseline

- Security headers on pages and API (`src/config/security-headers.ts`) and on static files
  (`public/_headers`): CSP, HSTS, `nosniff`, `X-Frame-Options: DENY`, referrer and permissions
  policies, `Cross-Origin-Opener-Policy`.
- The CSP allows inline scripts because pre-rendered Next.js pages need them; a nonce-based
  policy would force per-request rendering (CPU cost). No third-party origins are allowed yet;
  the payment provider's origins are added in the payments phase.
- Secrets only exist as Worker secrets and in git-ignored local files. `.gitignore` blocks
  `.env*` and `.dev.vars*` except the `*.example` templates.
- `/api/health` never touches the database unless called with the health token, so anonymous
  traffic cannot keep the metered database compute awake.
- Admin access fails closed: on deployed Workers only a verified Cloudflare Access token is accepted (see DEPLOYMENT.md); locally an explicit development switch. Admin writes also need a same-origin request with `X-Requested-With: kce-admin`. Phase 5 replaces Access with the store's own admin login.

## Admin screens

`/admin` pages are pre-rendered static shells that load their data from the admin API in the
browser, so viewing the admin costs no server rendering. The product editor is
`/admin/product?id=…` (a query string rather than `/admin/products/[id]`, which would render on
every request). The admin has its own layout and stylesheet (`src/styles/admin.css`, every rule
scoped under `.admin`) built on the site's tokens, fonts and form styles.

## Styling

The existing design lives in `src/styles/site.css` and is unchanged. Tailwind is loaded
without its reset (preflight) so it cannot alter the existing look. `site.css` is unlayered and
therefore wins over Tailwind utilities on the same element: new components can use Tailwind
freely; when restyling an existing element, change `site.css` or use Tailwind's `!` modifier.

## Known warnings carried over

oxlint reports React-compiler style warnings in `src/three/` and some older components (refs
mutated inside the animation loop, state set in effects). These are standard react-three-fiber
patterns and changing them risks the animations, so they are warnings in those folders and
errors everywhere else. Revisit in the UI polish phase.
