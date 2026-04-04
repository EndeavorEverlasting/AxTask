# Production database migration strategy (overview)

**Purpose:** Single entry point for moving AxTask to a new host or Postgres instance while keeping application data and feature parity. **Do not put credentials or connection strings in this file** — use your host dashboard and local `.env` (gitignored).

## Integration tip and branches

- **Tip `U`:** Work from branch **`integration/migration-unified`**, which is intended to combine the admin feature line with the Replit-published schema and migrations so nothing critical is left behind.
- **Replit-related SHAs and merge notes:** See [MIGRATION_UNIFIED_LOG.md](./MIGRATION_UNIFIED_LOG.md) (e.g. `008a8b0`, `afe5210`) and [PRODUCTION_MIGRATION_BRANCH_REPORT.md](./PRODUCTION_MIGRATION_BRANCH_REPORT.md).
- **Data path:** Postgres **backup → restore to target → `npm run db:push`** from a checkout of **`U`**, then deploy. Git history does not contain row data.

## PR review and quality gates

1. Open or update a PR from your migration/integration branch so automated review (e.g. CodeRabbit) can run.
2. Triage blocking comments; after substantive changes run **`npm run build`** and **`npm test`**.
3. When `DATABASE_URL` points at a **restored staging** database, run **`npm run migration:check:full`** (or the individual steps in [MIGRATION_AUTOMATION.md](./MIGRATION_AUTOMATION.md)).

## Automated checks (repo scripts)

| Goal | Where to look |
|------|----------------|
| Backup / restore (Windows) | [scripts/migration/pg-backup.ps1](../scripts/migration/pg-backup.ps1), [scripts/migration/pg-restore.ps1](../scripts/migration/pg-restore.ps1) |
| Schema alignment with **`U`** | `npm run db:push` from checkout **`U`** |
| Table presence | `npm run migration:verify-schema` |
| Build and tests | `npm run build`, `npm test` |
| HTTP health | `npm run migration:smoke-api` (set `BASE_URL` for preview/production) |
| Orchestrated reminders | `npm run migration:check` / `migration:check:full` |

Full detail: [MIGRATION_AUTOMATION.md](./MIGRATION_AUTOMATION.md). Branch comparison helper: [scripts/migration/compare-migration-refs.ps1](../scripts/migration/compare-migration-refs.ps1).

## Staging, cutover, and DNS

- **Staging restore and manual validation:** [STAGING_CUTOVER_RUNBOOK.md](./STAGING_CUTOVER_RUNBOOK.md)
- **DNS / TLS and zero-downtime patterns:** [CUTOVER_RUNBOOK.md](./CUTOVER_RUNBOOK.md), [MORNING_NEW_BOX_MIGRATION_CHECKLIST.md](./MORNING_NEW_BOX_MIGRATION_CHECKLIST.md), [MORNING_NEW_BOX_MIGRATION_GUIDE.md](./MORNING_NEW_BOX_MIGRATION_GUIDE.md)
- **48-hour style cutover guardrails:** [DEPLOYMENT_MIGRATION_PLAN.md](./DEPLOYMENT_MIGRATION_PLAN.md)

Typical flow: add the custom domain in your **app host** (e.g. Render), create the **DNS records** your registrar shows (CNAME/ALIAS/A as instructed), lower TTL while testing, then confirm **`/health`** and **`/ready`** over HTTPS (`migration:smoke-api` with `BASE_URL`).

## Branch roles (reference)

| Branch | Role |
|--------|------|
| **`baseline/published`** | Historical published baseline; verify deploy SHAs before relying on a remote branch name alone. |
| **`experimental/next`** | Admin feature line merged into **`U`**. |
| **`main`** | Merge or fast-forward **`U`** when the PR is green and you want the default branch to match production policy. |

## Risks and reminders

- **Schema:** Run `db:push` against a **copy** of production (or staging) before applying changes to the live production database.
- **Attachments:** If production used on-disk paths, plan to sync **`storage/attachments`** (see [server/services/attachment-storage.ts](../server/services/attachment-storage.ts)).
- **Sessions:** A new **`SESSION_SECRET`** invalidates existing session cookies unless you deliberately reuse the secret and restore session-related data; plan comms or a short maintenance window if users must re-login.
