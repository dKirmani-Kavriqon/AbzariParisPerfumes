# Backups and recovery

Two layers, both free.

| | Neon point-in-time restore | Nightly dump (GitHub Actions → R2) |
| --- | --- | --- |
| Protects against | Mistakes in the last few hours (bad edit, bad migration) | Anything older, and losing the Neon project itself |
| How far back | **6 hours** (Neon free plan) | **30 daily copies** + the 1st of every month kept indefinitely |
| Where | Inside Neon | Private R2 bucket `abzari-paris-backups` (separate from Neon) |
| Restore time | A minute (create a branch at a past time) | A few minutes (`pg_restore` into a new branch or project) |
| Cost | $0 | $0: a few MB per day; R2's free tier is 10 GB |
| Status | Works today (tested 14 Nov 2026) | Ready; needs the one-time setup below |

## Nightly dump

`.github/workflows/backup.yml`, every night at 21:47 UTC (03:17 IST), and on demand from the
Actions tab:

1. `pg_dump` (custom format, compressed) of the `public` and `drizzle` schemas, using a
   **read-only** database role.
2. **Restore check:** the dump is restored into a fresh Postgres 18 inside the job, and row
   counts of the catalogue tables are compared with the live database. A dump that does not
   restore fails the job, so a bad backup is noticed the next morning, not on the day it is needed.
3. Upload to R2 `daily/neondb-YYYY-MM-DD.dump`; on the 1st of the month also `monthly/…`.
4. A bucket lifecycle rule deletes `daily/` objects after 30 days. `monthly/` is kept.

The Neon Auth tables (`neon_auth` schema) are managed by Neon and not part of the dump.

Once customer and order data exist (Phase 3B onwards), dumps should also be encrypted before
upload (for example with `age` and a key held outside GitHub); the bucket is private, but
encryption limits the damage of a leaked API token.

### One-time setup (needs the account owner)

1. **Bucket.** Cloudflare dashboard → R2 → Create bucket `abzari-paris-backups` (location: Asia-
   Pacific; keep public access off). Settings → Object lifecycle rules → add: prefix `daily/`,
   delete objects after **30 days**.
2. **Read-only role.** Neon console → project `abzari-paris` → Roles → add `backup_reader`. Then
   run once in the SQL editor (as `neondb_owner`):
   ```sql
   GRANT pg_read_all_data TO backup_reader;
   ```
3. **Secret.** Neon console → Connect → role `backup_reader`, copy the connection string. GitHub →
   repository → Settings → Secrets and variables → Actions → new secret `BACKUP_DATABASE_URL`.
4. Check that the Cloudflare token used by GitHub (`CLOUDFLARE_API_TOKEN`) includes
   **Workers R2 Storage: Edit** (the "Edit Cloudflare Workers" template does).
5. Actions → "Nightly database backup" → Run workflow, and confirm it ends green with matching
   row counts.

## Restoring

### From the last 6 hours (Neon point-in-time)

```bash
neon branches create --project-id mute-math-91528715 --name restore-$(date +%Y%m%d) --parent 2026-11-14T10:49:15Z
```

Check the data on the new branch (connection string: `neon connection-string restore-… --project-id …`).
To recover a few rows, copy them across. To roll back everything, point the Worker's
`DATABASE_URL` secret at the restored branch (or use Neon's branch restore in the console).
Delete test branches afterwards.

### From a nightly dump

1. Download the dump: Cloudflare dashboard → R2 → `abzari-paris-backups` → `daily/…`, or
   `npx wrangler r2 object get abzari-paris-backups/daily/neondb-YYYY-MM-DD.dump --file restore.dump --remote`.
2. Create an **empty** target: a new Neon branch with `--schema-only` is not needed; use a new
   Neon project or a new database (`neon databases create`) so nothing existing is overwritten.
3. Restore:
   ```bash
   pg_restore --no-owner --no-privileges --exit-on-error --dbname "$TARGET_DATABASE_URL" restore.dump
   ```
4. Verify row counts and spot-check products, then switch the Worker's `DATABASE_URL` secret to
   the restored database if you are replacing production.

Never restore over the production database in place; restore beside it, check, then switch.

## Tested

- 14 Nov 2026: point-in-time restore of production as it was 30 minutes earlier into a separate
  branch; table counts matched; branch deleted.
- The nightly job verifies its own dump by restoring it on every run (once set up).
