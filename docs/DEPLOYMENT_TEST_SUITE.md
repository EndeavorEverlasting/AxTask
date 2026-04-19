# Deployment test suite

## Why this exists

A production deploy on Render crashed inside `scripts/apply-migrations.mjs`
with Postgres error **`53100` `project size limit (512 MB) has been
exceeded`**, with a Neon hint pointing at `neon.max_cluster_size`. The build
was fine; the deploy was fine up to the migration phase; the DB itself was
at or above its plan ceiling. There was no gate that would have caught this
before `apply-migrations.mjs` tried to write.

This suite mirrors Render's deploy pipeline and adds that gate.

## Layout

```
tests/deploy/
  00-contract/             package.json, runtime files Render/Docker depend on
  01-env/                  check-env.mjs validator contract
  03-artifacts/            dist/ + runtime file presence
  04-migrations/           apply-migrations.mjs shape + production-start order
  06-health/               /health and /ready endpoint contract
  08-regression/           build-manifest.mjs — regression-ready snapshots
  09-failure-classification/ log classifier with Neon failure fixture

scripts/deploy/
  check-env.mjs            validate required env (fail fast)
  check-artifacts.mjs      validate dist/ + runtime files after build
  build-manifest.mjs       emit dist/build-manifest.json (sha, chunk sizes)
  check-db-capacity.mjs    PRE-MIGRATION DB size gate (THE gate)
  classify-deploy-failure.mjs  bucket a deploy log into a failure class
```

## npm scripts

| Script                         | When to run |
| ------------------------------ | ----------- |
| `npm run test:deploy`          | Full suite (contract + env + artifacts + migrations + health + regression + classify). Runs in CI via `npm test`. |
| `npm run test:deploy:contract` | Just `tests/deploy/00-contract` — fast (no DB, no build). |
| `npm run test:deploy:env`      | Runs the env validator CLI (dev profile) then the unit tests. |
| `npm run test:deploy:artifacts`| Verifies the artifact checker logic. Does **not** require a real build. |
| `npm run test:deploy:migrations` | Contract tests on `apply-migrations.mjs` + production-start chain order. |
| `npm run test:deploy:health`   | Asserts `/health` and `/ready` are mounted with the expected shape. |
| `npm run test:deploy:regression`| Exercises `build-manifest.mjs`. |
| `npm run test:deploy:classify` | Runs the failure-log classifier against fixture logs. |
| `npm run test:deploy:capacity` | **Live DB** capacity check. Requires `DATABASE_URL`. |

## The DB capacity gate (critical)

`scripts/deploy/check-db-capacity.mjs` queries
`SELECT pg_database_size(current_database())` and compares to a configurable
budget (default **512 MB**, matching the Neon free plan). Thresholds:

| DB size vs budget | Level        | Exit code | Behavior |
| ----------------- | ------------ | --------- | -------- |
| < 75%             | `ok`         | 0         | Proceed silently. |
| ≥ 75%             | `warn`       | 0         | Print a warning, proceed. |
| ≥ 85%             | `soft_fail`  | 1         | Block unless `AXTASK_DB_CAPACITY_ACK=1`. |
| ≥ 90%             | `hard_fail`  | 2         | Block unconditionally. |

Environment:

- `AXTASK_DB_SIZE_BUDGET_BYTES` — override the 512 MB default (e.g. after
  a plan upgrade).
- `AXTASK_DB_CAPACITY_ACK` — set to `1` to acknowledge a soft-fail and
  proceed (CI operator opt-in).
- `AXTASK_DB_CAPACITY_JSON` — set to `1` to also emit the full report as
  JSON on stdout.

### Wiring into Render deploy

The simplest wiring is to prepend the capacity check to
`scripts/production-start.mjs` before SQL migrations run. This suite
intentionally ships the script without auto-wiring so you can roll it out
gradually:

1. First, run it locally against a staging DB to confirm the budget and
   thresholds are sane for your data volume.
2. Then add a pre-deploy step to Render calling
   `node scripts/deploy/check-db-capacity.mjs` before migrations.
3. If it hard-fails, archive or delete data, or raise the budget after a
   plan upgrade.

## Classifying a failed deploy

When a deploy fails, grab the Render log and pipe it through the
classifier to get a single-word bucket:

```bash
cat deploy-log.txt | node scripts/deploy/classify-deploy-failure.mjs
# -> DB_CAPACITY_EXCEEDED_DURING_MIGRATION
```

Buckets include: `DB_CAPACITY_EXCEEDED_DURING_MIGRATION`, `MIGRATION_FAILED`,
`DB_UNREACHABLE`, `ENV_MISSING`, `BUILD_FAILED`, `ARTIFACT_MISSING`,
`STARTUP_FAILED`, `HEALTHCHECK_FAILED`, `SMOKE_FAILED`, `UNKNOWN`.

Fixture logs for each bucket live in `test-fixtures/deploy-logs/`. When you
hit a new failure mode, add the log there and extend
`CLASSIFIERS` in `scripts/deploy/classify-deploy-failure.mjs`.

## In-app visibility (Admin > Performance)

The pre-deploy capacity gate is paired with two runtime pieces so the
ceiling never sneaks up on anyone:

- **Retention prune worker** — [`server/workers/retention-prune.ts`](../server/workers/retention-prune.ts).
  Runs once a day (2 minutes after boot, then every 24h). Deletes rows
  older than their per-table retention window from `security_events`
  (30d), `security_logs` (30d), `usage_snapshots` (60d), and expired
  `password_reset_tokens` (7d). No `VACUUM FULL` — that's an operator
  cleanup step, not a scheduler step. Disable with
  `DISABLE_RETENTION_PRUNE=true`; tune with
  `RETENTION_PRUNE_INTERVAL_MS`.
- **DB size gauge** — `GET /api/admin/db-size` (admin + step-up), 60s
  cache, rendered as a progress bar in Admin > Performance via
  [`client/src/components/admin/db-size-card.tsx`](../client/src/components/admin/db-size-card.tsx).
  Thresholds match the pre-deploy gate: OK < 70%, WARN 70–85%, BAD ≥ 85%.

If the bar hits red and the prune worker isn't keeping up, the next
things to investigate (by contribution, biggest first) are attachments
(binary columns in `attachments`), `security_events` (hot-path audit
trail), and `archetype_rollup_daily` + `archetype_markov_daily`
(bounded but chunky).

## Related

- [`docs/GIT_BRANCHING_AND_DEPLOYMENT.md`](GIT_BRANCHING_AND_DEPLOYMENT.md) —
  branching & deploy workflow.
- [`docs/DEV_DATABASE_AND_SCHEMA.md`](DEV_DATABASE_AND_SCHEMA.md) — how
  migrations, `apply-migrations.mjs`, and drizzle-kit fit together.
- [`render.yaml`](../render.yaml) — Render service config
  (`autoDeploy: true`, `healthCheckPath: /ready`). With autoDeploy on,
  every push to the deploy branch ships, and the only thing between the
  push and a live migration is the capacity gate wired at the top of
  `scripts/production-start.mjs`. If you ever set `autoDeploy: false`
  (e.g. a migration freeze window), update the contract test in
  `tests/deploy/06-health/health-contract.test.ts` to match.
