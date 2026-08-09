# Deployment test suite

## Why this exists

AxTask has now encountered two distinct database-capacity incidents:

1. an earlier Render deployment failed during migration with Postgres `53100`
   after a 512 MB-era Neon limit was reached;
2. the 2026-08-09 production re-entry measured a **36.20 GB** database with
   `public.security_events` at **36.19 GB**, while a separately configured
   10 GiB operator budget caused the pre-migration capacity gate to fail closed.

The second incident proved that an operator operational/spend budget, a provider
capacity hint, and actual PostgreSQL size must remain separate concepts. A stale
plan number must never masquerade as provider truth.

Production Render is intentionally suspended during the active recovery window.
See [`DB_RECOVERY_RUNBOOK.md`](DB_RECOVERY_RUNBOOK.md).

## Layout

```text
tests/deploy/
  00-contract/             package.json, runtime files Render/Docker depend on
  01-env/                  check-env.mjs validator contract
  03-artifacts/            dist/ + runtime file presence
  04-migrations/           apply-migrations.mjs shape + production-start order
  06-health/               /health and /ready endpoint contract
  08-regression/           build-manifest.mjs — regression-ready snapshots
  09-failure-classification/ log classifier fixtures
  11-capacity-gate/        explicit operator-budget semantics
  12-db-audit-forensics/   read-only forensics + targeted reclaim contracts
  13-deployment-config/    manual recovery promotion and containment contracts

scripts/deploy/
  check-env.mjs               validate required env (fail fast)
  check-artifacts.mjs         validate dist/ + runtime files after build
  build-manifest.mjs          emit dist/build-manifest.json
  check-db-capacity.mjs       pre-migration size/policy gate
  classify-deploy-failure.mjs classify deploy log failures

scripts/
  db-size-audit.mjs           read-only database/security_events forensics
  db-contain-api-request.mjs  one-off suppression-trigger containment
  db-reclaim-api-request.mjs  targeted api_request logical/physical recovery
```

## npm scripts

| Script | When to run |
| --- | --- |
| `npm run test:deploy` | Full deploy contract/regression suite. |
| `npm run test:deploy:contract` | Fast runtime/deploy contract checks. |
| `npm run test:deploy:env` | Environment validator and contracts. |
| `npm run test:deploy:artifacts` | Runtime artifact checker contracts. |
| `npm run test:deploy:migrations` | Migration/startup-order contracts. |
| `npm run test:deploy:health` | `/health` and `/ready` contracts. |
| `npm run test:deploy:regression` | Deployment regressions including UI smoke. |
| `npm run test:deploy:classify` | Failure-log classifier fixtures. |
| `npm run test:deploy:capacity` | Live DB capacity report/check; requires `DATABASE_URL`. |
| `npm run test:deploy:capacity-gate` | Static explicit-budget safety contracts. |
| `npm run test:deploy:db-audit-forensics` | Forensics/reclaim safety contracts. |
| `npm run test:deploy:deployment-config` | Manual recovery/startup/containment contracts. |

## The DB capacity gate

`scripts/deploy/check-db-capacity.mjs` always measures the actual database size.
Threshold classification happens **only** when the operator explicitly configures
`AXTASK_DB_SIZE_BUDGET_BYTES`.

| Configuration / utilization | Level | Exit code | Behavior |
| --- | --- | ---: | --- |
| budget variable absent | `ok` / report-only | 0 | Measure/report size and provider hint; no invented ceiling. |
| valid budget, <75% | `ok` | 0 | Proceed. |
| valid budget, ≥75% | `warn` | 0 | Warn and proceed. |
| valid budget, ≥85% | `soft_fail` | 1 | Block unless `AXTASK_DB_CAPACITY_ACK=1`. |
| valid budget, ≥90% | `hard_fail` | 2 | Block unconditionally. |
| explicitly empty/malformed budget | fatal | 3 | Fail closed; unset deliberately for report-only mode or provide a valid positive byte count. |

Environment:

- `AXTASK_DB_SIZE_BUDGET_BYTES` — optional **operator-selected operational/spend
  ceiling**, not a provider physical limit.
- `AXTASK_DB_CAPACITY_ACK` — explicit soft-fail acknowledgement.
- `AXTASK_DB_CAPACITY_JSON=1` — emit machine-readable report.

Provider metadata such as `neon.max_cluster_size` is reported separately and is
never automatically used as the utilization denominator or billing-plan allowance.

## Startup and recovery separation

Normal `scripts/production-start.mjs` remains fail-closed:

```text
environment gate
→ explicit capacity policy
→ normal SQL migrations
→ guarded Drizzle policy
→ server
```

A capacity incident is **not** repaired by a startup bypass. Recovery mutations
are separate operator commands and follow R0–R9 in `DB_RECOVERY_RUNBOOK.md`.
Normal startup never enables an `AXTASK_DB_RECOVERY_MODE` and never bypasses the
migration airlock.

## Security-events recovery contracts

The repository recovery tools are deliberately split:

- `db-size-audit.mjs --forensics` — SELECT-only evidence.
- `db-contain-api-request.mjs` — installs/verifies only the `api_request`
  suppression trigger after explicit authorization; no row deletion and no
  migration-ledger mutation.
- `db-reclaim-api-request.mjs` — bounded deletion of only eligible historical
  `api_request` rows; requires origin-active containment for mutation.
- `db-reclaim-api-request.mjs --vacuum-full ...` — separately confirmed physical
  rewrite for an authorized maintenance window; never automatic after deletion.

Do not use the older broad `db-reclaim.mjs` as the first response to this incident;
its aggressive mode can truncate all `security_events`, including meaningful audit
classes.

## Render promotion posture

During the active recovery window, [`render.yaml`](../render.yaml) sets:

- `autoDeploy: false`
- `healthCheckPath: /health`
- `SKIP_DB_PUSH_ON_START=true`

`main` remains the accepted production source branch, but a merge to `main` is not
permission to resume/deploy Render. R8 requires an explicit operator decision after
R0–R7 evidence is complete.

`/health` is DB-free process liveness. `/ready` is the intentional DB-backed
readiness endpoint.

## Failure classification

When a deploy fails, capture the Render log and pipe it through:

```bash
cat deploy-log.txt | node scripts/deploy/classify-deploy-failure.mjs
```

Fixtures live in `test-fixtures/deploy-logs/`. Add a fixture and classifier rule
when a genuinely new failure mode is observed.

## Related

- [`DB_RECOVERY_RUNBOOK.md`](DB_RECOVERY_RUNBOOK.md) — R0–R9 incident workflow.
- [`GIT_BRANCHING_AND_DEPLOYMENT.md`](GIT_BRANCHING_AND_DEPLOYMENT.md) — branch and promotion policy.
- [`DEV_DATABASE_AND_SCHEMA.md`](DEV_DATABASE_AND_SCHEMA.md) — migration/schema model.
- [`SCHEMA_EVOLUTION_PIPELINE.md`](SCHEMA_EVOLUTION_PIPELINE.md) — deterministic production schema policy.
- [`render.yaml`](../render.yaml) — current manual recovery promotion config.
