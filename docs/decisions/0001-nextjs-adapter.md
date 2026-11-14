# 0001: Running Next.js on Cloudflare Workers: OpenNext over vinext

- **Status:** accepted
- **Date:** 2026-11-14

## Context

The storefront moves from Vite to Next.js and must run on Cloudflare Workers' free plan. Two
adapters exist: **OpenNext** (`@opennextjs/cloudflare`, adapts the output of `next build`) and
**vinext** (Cloudflare's reimplementation of the Next.js API on Vite, now the default in
Cloudflare's Next.js guide).

## How they were compared

The real application, not a demo page, was built with each adapter from the same commit, plus a
temporary page rendered on every request (full product grid, reads server config) to exercise
server rendering. Both builds ran in the local Workers runtime (`workerd`) and were checked with
the same Playwright script used for the original Vite site's baseline: 11 routes × desktop and
mobile, pixel comparison, text fingerprints, console errors, image loading, 3D canvas.

## Results

| Test | OpenNext 1.20.17 | vinext 1.4.5 |
| --- | --- | --- |
| Routing (11 routes, query strings, 404s) | ✅ all correct | ✅ all correct |
| Pre-rendered HTML contains page content | ✅ | ✅ (28 routes pre-rendered) |
| Server rendering per request | ✅ | ✅ |
| Static assets + cache headers (`_headers`) | ✅ | ✅ |
| API routes (200 / 404 / 405 + Allow / 422) | ✅ | ✅ |
| Server-side environment variables | ✅ out of the box (`process.env`) | ⚠️ only after adding `nodejs_compat` and declaring each var/secret in `cloudflare.config.ts` (generated config had neither) |
| Security headers from `next.config.ts` | ✅ | ✅ |
| 3D scenes | ✅ renders; differences within the original site's own run-to-run variation | ✅ same |
| Pixel match vs original site (non-3D screenshots) | ✅ 0.000% on all 40 | ✅ 0.000% on all 40 |
| Console errors / CSP violations | none | none |
| Mobile layout | ✅ identical heights and pixels | ✅ identical |
| Images | ✅ 30/30 on home, all pages | ✅ |
| Build time (clean) | ~19 s (`next build` + bundling) | ~11 s |
| Server bundle (gzip) | 1,663 KiB | 719 KiB |
| Build reliability | stable; uses Next.js's own compiler | worked; many sourcemap and chunking warnings |
| Deploy tool | Wrangler 4 (stable) | `cf` CLI **1.0.0-beta.32** and `@cloudflare/vite-plugin@beta`, installed unpinned |
| New security advisories | none at runtime (build-only `glob`/`minimatch`, moderate) | 10 added (9 moderate, 1 high, dev tooling) |
| Project maturity | years in production use | README: "under active development … not yet a drop-in replacement for every … production workload" |
| Known gaps affecting us | none found | App Router not wrapped in React Strict Mode (Next.js does) |
| Worker CPU per request on Cloudflare | see below | see below |
| Worker startup time (Wrangler) | 23 ms | n/a (deployed with `cf`) |
| Database reachable from the deployed Worker | ✅ | ✅ |

## Decision

**OpenNext.** Both adapters ran this application correctly, so the decision rests on risk:
OpenNext runs Next.js's own build output with a stable deploy tool and added no runtime
advisories, while vinext depends on beta tooling and reimplements Next.js behaviour. vinext's
smaller bundle and faster builds are real advantages but not ones this store needs today. For a
platform meant to be reused across clients and maintained by other developers, the more proven
path wins.

Reconsider when vinext and the `cf` CLI leave beta, or if Worker CPU on the free plan becomes a
constraint that vinext measurably solves.

## CPU on Cloudflare (free plan)

Both evaluation Workers were deployed to workers.dev from GitHub Actions and sent identical load:
25 requests to each of 9 routes, from one client (served by Cloudflare's IAD location). CPU per
request comes from Workers Logs. Figures are from the second run, with both Workers warm; a first
run against a freshly deployed Worker showed cold-start medians up to 131 ms on the server-rendered page.

| Route | OpenNext CPU ms, median / max | vinext CPU ms, median / max |
| --- | --- | --- |
| `/` (pre-rendered, largest page) | **5** / 11 | 13 / 30 (13 of 25 over 10 ms) |
| `/shop`, `/shop?c=oil` (pre-rendered) | **2–3** / 7 | 4–5 / 19 |
| `/product/*`, `/about` (pre-rendered) | **2** / 5 | 2–3 / 9 |
| `/api/health` (route handler) | 10 / 180 | **4** / 15 |
| 404 page | 8 / 16 | 11 / 66 |
| `/eval/ssr` (full catalogue rendered per request) | 35 / 255 | 36 / 119 |

All 1,100+ measured requests succeeded; Cloudflare reported no `exceededCpu` outcomes even where
requests used more than the documented 10 ms. That leniency is not documented and must not be relied on.

What this means:

- **Pre-rendered pages, most of the traffic, are cheaper on OpenNext** and fit the free plan.
- **Server rendering costs about 35 ms per request on either adapter**, 3.5× the free-plan limit.
  The adapter choice does not fix this; architecture does. Pages stay pre-rendered; per-user
  views (cart, checkout, account, admin) load as static shells that call small API routes.
- **API routes cost about 10 ms on OpenNext against 4 ms on vinext** because they pass through
  Next.js's router. Phase 2 will serve `/api/*` from a lightweight handler in front of Next.js in
  the same Worker (OpenNext allows a custom Worker entry) and measure again. If API routes still
  approach the limit, the Workers Paid plan ($5/month, 30 s CPU) is the fallback, and it needs approval.
- vinext recovers from cold starts with lower spikes (max 119 ms against 255 ms).

The CPU figures do not change the decision: the two adapters trade wins, and the remaining
differences favour OpenNext's maturity.

The evaluation Workers (`kce-eval-opennext`, `kce-eval-vinext`) were deleted after measuring.
The temporary branches `preview/eval-opennext` and `preview/eval-vinext` hold only that experiment and can be deleted.
