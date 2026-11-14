# Setting up another client

The engine runs **one store per deployment**. Each client has their own Worker, database,
payment account and email domain, so no customer data is ever shared between clients. There is
no multi-tenant mode, by design.

## What changes per client

| What | Where |
| --- | --- |
| Store name, description, contact details, branding colours, business text | `src/config/store.ts` |
| Logo, product photos, favicon | `src/assets/brand/`, `public/` |
| Visual design | `src/styles/site.css` and the components |
| Worker name and Cloudflare account | `wrangler.jsonc` (`name`, `account_id`, the `WORKER_SELF_REFERENCE` service) |
| Preview hostname for the smoke test | `.github/workflows/deploy-preview.yml` (`PREVIEW_HOST`) |
| Secrets | Worker secrets for that client's Worker only |
| Admin access | That client's Cloudflare Access application (`ADMIN_ACCESS_*` vars) |
| Image bucket | That client's R2 bucket (`MEDIA_BUCKET` binding) |

Everything under `src/commerce/`, `src/server/` and `src/app/api/` stays the same.

## Steps

1. Create the client's repository from this one (or a branch while the engine is not yet a separate package).
2. Create a Neon project for the client (free plan allows 100 projects per organisation), in the
   region closest to their customers. Turn off the Data API. Cap compute.
3. Edit the files in the table above.
4. Apply migrations to the new database: `DATABASE_URL=... npm run db:migrate -- --apply`, then
   create the store row (and any starting catalogue) with `npm run db:seed -- --apply`, after
   replacing `src/data/products.ts` with the client's products (or leave it empty and use the admin).
5. Set the Worker secrets for the new Worker (`npx wrangler secret put DATABASE_URL`, ...).
6. Add the client's `CLOUDFLARE_API_TOKEN` to the repository's Actions secrets and push to a
   `phase-*` or `preview/**` branch to deploy a preview.

Later phases add the payment account (one Razorpay account per client, in the client's name) and
the email sending domain (verified in Resend under the client's domain).
