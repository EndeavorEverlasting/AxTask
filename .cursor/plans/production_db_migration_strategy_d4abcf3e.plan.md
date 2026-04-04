---
name: Production DB migration strategy
overview: Ship AxTask on the next host from integration tip U (integration/migration-unified), preserving Postgres data and all product lines (collaborators, Replit feature commits 008a8b0/afe5210, admin experimental). Automate schema verify, tests, and HTTP smoke; triage Coderabbit on the feature PR; configure Render + Porkbun DNS in the morning.
todos:
  - id: integration-branch-u
    content: Deploy and PR from integration/migration-unified; merge 008a8b0/afe5210 from origin when pushed
    status: pending
  - id: coderabbit-triage
    content: Resolve Coderabbit findings on feature PR; re-run npm run build and npm test
    status: pending
  - id: automate-migration-checks
    content: After restore+db push run migration verify-schema build test smoke-api (see docs/MIGRATION_AUTOMATION.md)
    status: pending
  - id: render-porkbun
    content: Morning — Render custom domain + Porkbun DNS per Render records; TLS verify
    status: pending
  - id: staging-restore-then-upgrade
    content: pg-backup prod; pg-restore staging; db push U; migration verify-schema
    status: pending
  - id: cutover
    content: Final backup; restore target Postgres; deploy U; DNS cutover; rollback window
    status: pending
isProject: false
---

# Production migration (unified tip **U** + automation + next-day hosting)

## Current strategy (replaces linear P→E-only narrative)

- **Integration tip `U`:** branch **`integration/migration-unified`** — merges **`experimental/next`** with **`origin/replit-published-preproduction-clean`** (union schema: collaborators, patterns, classification, premium, MFA, notifications, etc.).
- **Replit rectification commits** (from your screenshots; merge when on `origin`):
  - **`008a8b0`** — feature bundle (planner, community, rewards, voice, rich task form, …).
  - **`afe5210`** — restore to stable baseline (parent `008a8b0`). **Deploy SHA D** may equal this while the tree might omit some of `008a8b0`; if so, merge/cherry-pick `008a8b0` into **U**.
- **Data** still flows **Postgres backup → restore → `npm run db:push` → deploy `U`**. Git does not contain rows.

Docs: [docs/MIGRATION_UNIFIED_LOG.md](../docs/MIGRATION_UNIFIED_LOG.md), [docs/STAGING_CUTOVER_RUNBOOK.md](../docs/STAGING_CUTOVER_RUNBOOK.md), [docs/PRODUCTION_MIGRATION_BRANCH_REPORT.md](../docs/PRODUCTION_MIGRATION_BRANCH_REPORT.md).

## Coderabbit (feature branch PR)

1. Open/update the PR for **`integration/migration-unified`** (or your feature branch) so Coderabbit runs.
2. **Triage comments** in the GitHub PR; fix blocking issues; push follow-ups.
3. After each push: **`npm run build`**, **`npm test`**, and optionally **`npm run migration:check:full`** when `DATABASE_URL` points at a restored staging DB.

## Automate data migration checks (implemented in repo)

| Step | Command / script |
|------|------------------|
| Backup (Windows) | [scripts/migration/pg-backup.ps1](../scripts/migration/pg-backup.ps1) with `DATABASE_URL` |
| Restore | [scripts/migration/pg-restore.ps1](../scripts/migration/pg-restore.ps1) |
| Schema match **U** | `npm run db:push` (from checkout of **U**) |
| Table presence | `npm run migration:verify-schema` |
| Compile + tests | `npm run build`, `npm test` |
| Live health | `npm run migration:smoke-api` (`BASE_URL` for Render) |
| Orchestrator | `npm run migration:check` / `migration:check:full` |

Full reference: [docs/MIGRATION_AUTOMATION.md](../docs/MIGRATION_AUTOMATION.md).

Branch diff helper: [scripts/migration/compare-migration-refs.ps1](../scripts/migration/compare-migration-refs.ps1).

## Morning: Render + Porkbun (domain + hosting)

1. **Render:** Web Service for AxTask → **Settings → Custom Domains** — add apex and/or `www`; copy the DNS records Render shows.
2. **Porkbun:** DNS for the domain → create **CNAME** / **ALIAS/ANAME** (or A records if Render specifies) exactly as Render instructs; lower TTL first if still testing.
3. Wait for TLS issuance; hit **`https://your-domain/health`** and **`/ready`** (`npm run migration:smoke-api` with `BASE_URL`).
4. Cross-check [docs/CUTOVER_RUNBOOK.md](../docs/CUTOVER_RUNBOOK.md) and [docs/MORNING_NEW_BOX_MIGRATION_CHECKLIST.md](../docs/MORNING_NEW_BOX_MIGRATION_CHECKLIST.md).

## Legacy branch roles (still useful)

| Branch | Role |
|--------|------|
| **`baseline/published`** | Frozen forensic **P** (deploy commit); do not trust polluted `origin/baseline/published` without verifying **D**. |
| **`experimental/next`** | Admin feature line merged into **U**. |
| **`main`** | Fast-forward or merge **U** when PR is green and you are ready for default branch = production. |

## Risk reminders

- **Schema union:** `db:push` against a **copy** of prod before touching production target.
- **Attachments:** sync `storage/attachments` if prod used disk paths ([server/services/attachment-storage.ts](../server/services/attachment-storage.ts)).
- **SESSION_SECRET:** new secret invalidates old sessions unless you intentionally reuse and restore `session` table.
