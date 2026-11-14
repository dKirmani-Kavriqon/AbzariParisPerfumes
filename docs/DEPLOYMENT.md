# Deployment

## Environments

| Environment | Worker | URL | Database | Deployed by |
| --- | --- | --- | --- | --- |
| Local dev | none | `http://localhost:3000` (`npm run dev`) | Neon dev branch via `.env.local` | you |
| Local Workers runtime | none | `http://localhost:8787` (`npm run preview`) | via `.dev.vars` | you |
| Preview | `abzari-paris-preview` | https://abzari-paris-preview.abzaric1.workers.dev | Neon `production` branch (no shop data yet) | GitHub Actions on push to `phase-*` / `preview/**` |
| Production | added at launch | client's domain | Neon `production` | manual approval (Phase 7) |

`abzaric1` is the Cloudflare account's workers.dev subdomain (account-wide, set in the dashboard).
No custom domain, routes or DNS are configured.

## Deploying

The Worker entry is `worker.ts`: it answers `/api/*` and `/media/*` with the API router before
Next.js runs (much less CPU per request), only serves `/admin` pages to an admin (everyone else
gets the 404 page), and hands everything else to OpenNext's generated handler.

Pages are pre-rendered from the live published catalogue at build time: the deploy job sets
`CATALOG_SOURCE_URL` to the preview's `/api/catalog` (public data, no secrets). A brand-new
environment has no catalogue to read on its first deploy: the pages then build without products and
fill in from the live catalogue in the browser; deploy a second time to bake the products in.
The same workflow also rebuilds from `main` daily.

Deploys run in GitHub Actions (`.github/workflows/deploy-preview.yml`):
`npm ci` → `opennextjs-cloudflare build` → `opennextjs-cloudflare deploy` → smoke test of `/`,
`/shop`, `/product/rawah` and `/api/health`.

It needs one repository secret:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token created from the **Edit Cloudflare Workers**
  template, limited to this account. Add it in GitHub under **Settings → Secrets and variables →
  Actions**. Rotate it before it expires; the deploy step fails clearly if it is missing.

A developer with their own `wrangler login` can also run `npm run deploy:preview` locally.

> Note for Claude Code cloud sessions: the session's network proxy replaces the `Authorization`
> header on Cloudflare API calls, which breaks Wrangler's static-asset upload (it uses a
> short-lived upload token). Deploy through GitHub Actions from those sessions. Setting Worker
> secrets from the session works.

## Secrets strategy

| Where | What | How it is set |
| --- | --- | --- |
| Worker secrets | `DATABASE_URL`, `HEALTH_CHECK_TOKEN`; later `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY` | `wrangler secret put NAME` (prompts for the value, or reads it from stdin) or the Cloudflare dashboard: Worker → Settings → Variables and Secrets |
| Worker vars (`wrangler.jsonc`) | `APP_ENV`, `LOG_LEVEL`, and once Access is set up `ADMIN_ACCESS_TEAM_DOMAIN`, `ADMIN_ACCESS_AUD`, `ADMIN_EMAILS`: not secret | committed |
| GitHub Actions secret | `CLOUDFLARE_API_TOKEN` | GitHub settings |
| Local | `.env.local`, `.dev.vars` | copied from the `*.example` templates; git-ignored |

Rules: secrets are never committed, never put in `vars`, never logged, and never sent to the
browser (`src/server/env.ts` is server-only; CI scans the browser bundle). Each client and each
environment gets its own values; nothing is shared between clients.

To rotate the health-check token:

```bash
openssl rand -hex 32 | npx wrangler secret put HEALTH_CHECK_TOKEN
```

Then call `GET /api/health?checks=db` with header `x-health-token: <token>` to check the database
from the deployed Worker.

## Server environment variables

| Name | Secret | Purpose |
| --- | --- | --- |
| `APP_ENV` | no | `development`, `preview` or `production` |
| `LOG_LEVEL` | no | `debug`, `info`, `warn`, `error` |
| `DATABASE_URL` | **yes** | Neon pooled connection string |
| `HEALTH_CHECK_TOKEN` | **yes** | Unlocks `/api/health?checks=db` (32+ characters) |
| `ADMIN_ACCESS_TEAM_DOMAIN` | no | `<team>.cloudflareaccess.com`; with `ADMIN_ACCESS_AUD`, turns on admin access |
| `ADMIN_ACCESS_AUD` | no | The Access application's audience tag (64 hex characters) |
| `ADMIN_EMAILS` | no (kept as a Worker secret so emails stay out of the repo) | Optional comma-separated admin allowlist |
| `ADMIN_LOCAL_DEV` | no | `1` opens admin on localhost when `APP_ENV=development`; ignored elsewhere |
| `CATALOG_SOURCE_URL` | no | Build time only: where `next build` reads the catalogue when it has no `DATABASE_URL` |
| `CATALOG_REQUIRED` | no | Build time only: `1` fails the build if the catalogue cannot be read |

Bindings: `MEDIA_BUCKET` (R2, image uploads) once R2 is enabled; see
[CATALOGUE.md](CATALOGUE.md#enabling-uploads-r2).

## Turning on the admin for the preview (Cloudflare Access)

**Status (preview): configured.** Team domain `tiny-cloud-aadc.cloudflareaccess.com`, application
"Abzari Paris admin (preview)" on `/admin` and `/api/admin`, sign-in by email one-time PIN, policy
"Abzari Paris admins". The allowlist is also set as the Worker secret `ADMIN_EMAILS` (kept out of the
repository). To hand over to the client: edit the policy's emails in Zero Trust → Access →
Policies and update the secret (`npx wrangler secret put ADMIN_EMAILS`).

The admin is closed on deployed Workers until Cloudflare Access protects it. Access is
Cloudflare's login gateway, free for up to 50 users. Steps (Cloudflare dashboard, account level):

1. **Zero Trust** → choose a team name (e.g. `kavriqon`) and the **Free** plan.
2. **Access → Applications → Add an application → Self-hosted**. Domain:
   `abzari-paris-preview.abzaric1.workers.dev`, paths `admin` and `api/admin`. Add a policy that
   allows only your admin emails (one-time PIN by email works without any identity provider).
3. Copy the application's **AUD tag**.
4. In `wrangler.jsonc` `vars`, add `ADMIN_ACCESS_TEAM_DOMAIN` (`<team>.cloudflareaccess.com`),
   `ADMIN_ACCESS_AUD`, and optionally `ADMIN_EMAILS`, then deploy.

Visiting `/admin` then asks for a sign-in at Cloudflare's edge; the Worker additionally verifies
the signed token on every admin page and API call. Phase 5 replaces this interim setup with the
store's own admin login.

## Checking a deployment

- `GET /api/health`: `{ ok: true, data: { status: "ok", environment, database: "configured" } }`.
- Logs: Cloudflare dashboard → Workers → `abzari-paris-preview` → Logs (Workers Logs is enabled
  in `wrangler.jsonc`; the free plan has a daily event allowance), or `npx wrangler tail`.
- CPU time per request: Worker → Metrics, or Workers Logs (`$workers.cpuTimeMs`). The free plan allows 10 ms per request. Measured (median): pre-rendered pages 2–3 ms; API routes about 1 ms since Phase 2 (served by worker.ts before Next.js; 10 ms through Next.js in Phase 1), 3 ms with a database query; server-rendered pages about 35 ms, which is why pages stay pre-rendered (see docs/decisions/0001-nextjs-adapter.md). Phase 3A (preview, 25 requests per route): pages 3–5 ms including the live-catalogue check on product pages; `/api/catalog` 1 ms; catalogue search 2 ms; 404 for archived or unknown products 0 ms (served from the bundled 404 page; 8–16 ms when Next.js rendered it). Occasional first requests on a fresh Worker instance take 12–23 ms. Phase 3B (preview, served from Washington, Neon in Singapore): `POST /api/cart/quote` with items 2–4 ms once the Worker instance is warm (median 4–9 ms over 25 requests), 0 ms for an empty bag; wall time about 240 ms, almost all of it the round trip to Singapore (shoppers in India are much closer). In bursts from a cold start, about 1 in 3 quotes and some static pages took 10–32 ms on fresh instances; all requests succeeded.

## Free-plan limits to respect

| Service | Limit | How we stay inside it |
| --- | --- | --- |
| Workers requests | 100,000 / day | Static files don't count; pages are pre-rendered |
| Workers CPU | 10 ms / request | Static pages; no heavy work in request paths |
| Workers subrequests | 50 / request | Batch database queries |
| Cron triggers | 5 / account | Reserve for backups and housekeeping |
| Neon compute | 100 CU-hours / month, scales to zero | 1 CU cap; health check doesn't wake the database |
| Neon storage | 1 GB / project | Images are not stored in Postgres |
| GitHub Actions | free for public repos | concurrency limits cancel superseded runs |
