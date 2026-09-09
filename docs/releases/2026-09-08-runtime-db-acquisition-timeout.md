# 2026-09-08 — Runtime DB connection acquisition bound

## Recovered context

This slice revives only the current-compatible foundation from the closed, unmerged runtime-resilience PR #135. The old branch is substantially diverged from current `main`, so it is not being reopened or merged wholesale.

## Change

- `server/db.ts` now sets `connectionTimeoutMillis` on the node-postgres pool.
- Default acquisition timeout: 5 seconds.
- Optional `AXTASK_DB_CONNECTION_TIMEOUT_MS` tuning is clamped to 1–30 seconds; invalid or blank values fall back to 5 seconds.
- PostgreSQL sessions created by this pool set `application_name` to `axtask` for provider-side attribution.

## Why

Current main still used node-postgres's implicit no-timeout connection-acquisition behavior. During a provider/network incident, requests waiting for a connection could therefore stall indefinitely instead of failing inside a bounded operational window.

This slice intentionally does **not** add a global statement/query timeout. Normal application-query semantics are unchanged.

## Boundaries

- no Render/Neon/provider mutation
- no production database reads/writes/schema changes
- no migration or recovery-runbook changes
- no pool-size tuning
- no retry of mutations or POST-backed queries
- no change to `/health`, `/ready`, or current production re-entry gates
- no overlap with PR #139 harness infrastructure

## Validation

Focused contract:

```bash
npx vitest run tests/deploy/06-health/db-runtime-resilience.test.ts
```

Repository gates remain authoritative for type compatibility and release integration:

```bash
npm run check
npm test
npm run build
git diff --check
```

## Proof ceiling

Repository/CI proof can establish the timeout resolution contract, pool wiring, and TypeScript/build compatibility. It cannot prove provider availability, live 503 recovery, or production deployment/re-entry.
