# Abzari Paris

Storefront for Abzari Paris, built on the Kavriqon Commerce Engine: Next.js (App Router) with
React, TypeScript and Tailwind, deployed to Cloudflare Workers with OpenNext, and backed by Neon
Postgres through Drizzle ORM. Everything runs on free plans.

**Status:** Phase 2 (catalogue). Products, categories, variants, stock and images live in the
database and are managed at `/admin`. The storefront still renders from `src/data/products.ts`,
the cart lives in the browser and checkout is a demo. Payments, orders and email arrive later.

## Getting started

Needs Node.js 22 and npm.

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL for a Neon development branch
npm run dev                    # http://localhost:3000, Next.js dev server
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server with hot reload |
| `npm run preview` | Builds for Workers and runs it in the local Workers runtime (reads `.dev.vars`) |
| `npm run build` | Plain Next.js production build |
| `npm run build:worker` | Cloudflare Workers build (`.open-next/`) |
| `npm run deploy:preview` | Builds and deploys the workers.dev preview (normally done by GitHub Actions) |
| `npm run lint` / `typecheck` / `test` | oxlint, TypeScript, Vitest |
| `npm run check:bundle -- .open-next/assets` | Fails if browser files contain secrets or server code |
| `npm run db:generate` | Generates a migration from schema changes |
| `npm run db:migrate` | Dry run of pending migrations; add `-- --apply` to apply |
| `npm run db:verify` | Database connectivity and read/write check |
| `npm run db:seed` | Dry run of loading the store and catalogue; add `-- --apply` to load |

## Documentation

- [Architecture](docs/ARCHITECTURE.md): how the code is organised and why
- [Database](docs/DATABASE.md): connection, schema, safe migrations, seeding
- [Catalogue and inventory](docs/CATALOGUE.md): entities, isolation, money, stock ledger, images
- [API](docs/API.md): conventions and every endpoint
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md): Cloudflare, secrets, CI, preview environment
- [Setting up another client](docs/CLIENT_SETUP.md)
- [Decision: Next.js adapter for Workers](docs/decisions/0001-nextjs-adapter.md)

## What is where

| Path | What it does |
| --- | --- |
| `src/app/` | Routes only: pages, layouts and API route handlers. Thin files that call into the folders below. |
| `src/views/` | Page bodies (one per route) |
| `src/components/` | Shared UI: header, footer, cart drawer, product card |
| `src/components/RawahStory.tsx` | The pinned scroll story on the home page. It turns scroll progress and drag into motion state and fades the text chapters. |
| `src/three/RawahScene.tsx` | Canvas, studio lighting (built from Lightformers, so no HDR download) and the scroll choreography. |
| `src/three/Bottle.tsx` | The 50ml flacon: lathed glass, liquid, label, atomiser and cap. |
| `src/three/liquidMaterial.ts` | The liquid shader and the damped spring that drives the slosh. |
| `src/three/SprayMist.tsx` | The atomiser spray: droplets launched sideways from the nozzle, slowed by air drag, then drifting as mist. |
| `src/three/spray.ts` | Nozzle position, spray direction and the press rhythm shared by the bottle and the mist. |
| `src/three/label.ts` | Paints the label on a canvas and bends it onto the glass. |
| `src/data/products.ts` | All 21 products, prices and notes (moves to the database in Phase 2). |
| `src/config/store.ts` | Per-client settings: name, contact details, branding, business text. Public. |
| `src/commerce/catalog/` | Catalogue business rules: products, categories, variants, inventory, images, money, validation |
| `src/views/admin/`, `src/app/admin/` | The admin screens |
| `worker.ts` | Cloudflare Worker entry: API and media routes, admin gate, then Next.js |
| `src/server/` | Server-only code: environment, database, API conventions, logging, integrations |
| `drizzle/` | Generated SQL migrations, reviewed in pull requests |
| `public/products/`, `public/notes/` | Product photos and note images |

## How the liquid works

The oil is not a fluid simulation. It is a mesh the shape of the inside of the bottle, cut by a plane in world space, so it stays level however the bottle turns. Each frame the bottle's linear and angular velocity feed a damped spring that tilts that plane, which makes the oil lag, overshoot and settle. Back faces that survive the cut are shaded as the top surface of the liquid. This keeps the effect smooth on phones as well.

The glass body uses drei's `MeshTransmissionMaterial` on three's own transmission pass, so the oil is refracted (with slight chromatic aberration) but the label on the outside of the glass is not.

three.js only ever loads in the browser: the canvas mounts after hydration, so the server never bundles or runs it.

## How the spray works

When a note chapter is on screen the actuator presses every 2.6 seconds. Each droplet's position is a closed-form function of its age: a launch along a narrow cone from the nozzle, exponential air drag, then a slow billow and spread. It all runs in the vertex shader, so thousands of droplets cost no CPU time.

## Before going live

- The product photos are cut from screenshots of the current store. Swap in the original files at the same names for sharper images.
- The logo is traced from a small raster. A vector logo would make the header and the bottle label sharper.
- Only Rawah and Voyage have published notes. Other products show their photo, size and price.
- 100ml sizes are not listed because their prices are not published.
- Checkout, payments and the contact form need the backend phases before launch.
