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
| `ADMIN_EMAILS` | no | Optional comma-separated admin allowlist |
| `ADMIN_LOCAL_DEV` | no | `1` opens admin on localhost when `APP_ENV=development`; ignored elsewhere |

Bindings: `MEDIA_BUCKET` (R2, image uploads) once R2 is enabled; see
[CATALOGUE.md](CATALOGUE.md#enabling-uploads-r2).

## Turning on the admin for the preview (Cloudflare Access)

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
- CPU time per request: Worker → Metrics, or Workers Logs (`$workers.cpuTimeMs`). The free plan allows 10 ms per request. Measured in Phase 1: pre-rendered pages 2–5 ms, API routes about 10 ms, server-rendered pages about 35 ms (see docs/decisions/0001-nextjs-adapter.md).

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
