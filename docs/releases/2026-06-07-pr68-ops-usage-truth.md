# PR #68: Ops recovery + honest Neon usage reporting

Date: 2026-06-07

Supersedes PR #66 (keep #66 open until this PR merges).

## Summary

- Ops telemetry: in-memory counters, structured request logs, `/ops/status` bearer gate, boot/snapshot events.
- Usage truth: Neon billing JSON import, provider MTD attribution, admin polling mitigation.
- Schema: `provider_usage_snapshots` table (migration `0042_provider_usage_snapshots.sql`).
- Retention: `provider_usage_snapshots` pruned at 730 days (`scripts/db-retention.mjs`, `docs/DB_RETENTION_POLICY.md`).

## Database

- **Migration:** `migrations/0042_provider_usage_snapshots.sql`
- **Table:** `provider_usage_snapshots` — provider-reported billing metrics (Neon/Render imports)
- **Column:** `usage_snapshots.attribution_json` — optional daily ops attribution rollup
- **Idempotency:** unique index `idx_provider_usage_natural_key` on `(provider, project, branch, period_start, period_end, metric_name, source)`; re-import upserts metric rows

## Post-deployment operator tasks

1. Run SQL migrations: `npm run db:migrate` (or rely on production startup pipeline).
2. Set `OPS_STATUS_TOKEN` (random bearer for `GET /ops/status`).
3. Set `AXTASK_MONTHLY_BUDGET_CENTS` for budget warnings on the admin Usage tab.
4. Import Neon bill JSON via admin **Usage → Provider import** (exclusive `periodEnd`, e.g. `2026-06-01` → `2026-07-01`).
5. Set Neon spending cap in the Neon console.
6. Review `REGISTRATION_MODE` if compute pressure persists.

## Rollback

- **App:** revert deploy to prior release; ops counters are in-memory only (no DB rollback needed for telemetry).
- **Schema:** migration is additive; no down migration. Unique index prevents duplicate imports after rollback/re-deploy.
- **Data:** `provider_usage_snapshots` rows are safe to retain; delete manually only if a bad import occurred before the idempotency fix.

## Validation

- `npm run check`
- `npm test`
- `npm run test:deploy:health`
- `npm run test:deploy:migrations`
- `npm run test:deploy:contract`
- `npm run release:check`
- `npm run build`
