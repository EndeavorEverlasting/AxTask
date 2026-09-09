# 2026-09-08 — Runtime DB connection acquisition bound

## Recovered context

This slice revives only the current-compatible foundation from the closed, unmerged runtime-resilience PR #135. The old branch is substantially diverged from current `main`, so it is not being reopened or merged wholesale.

## Change

- `server/db.ts` now sets `connectionTimeoutMillis` on the node-postgres pool.
- Default acquisition timeout: 5 seconds.
- Optional `AXTASK_DB_CONNECTION_TIMEOUT_MS` tuning is clamped to 1–30 seconds; invalid or blank values fall back to 5 seconds.
- PostgreSQL sessions created by this pool set effective `application_name` to `axtask` for provider-side attribution.
- A URL-level `application_name` is stripped before pool construction because node-postgres parses `connectionString` after object options and would otherwise let the URL override the explicit attribution. Other URL query parameters are preserved.

## Why

Current main still used node-postgres's implicit no-timeout connection-acquisition behavior. In current pg-pool, `connectionTimeoutMillis` bounds both opening a new client and waiting in the pool's pending checkout queue when the pool is full. During provider/network degradation or connection pressure, callers therefore get a bounded acquisition failure instead of an indefinite pool wait.

This slice intentionally does **not** add a global statement/query timeout. Once a client has been acquired and a query is executing, normal application-query duration semantics are unchanged.

## Review reconciliation

- **Pool-queue timeout warning:** rejected after checking current pg-pool implementation. `Pool.connect()` installs a timer on pending checkout items when `connectionTimeoutMillis` is set, removes timed-out callbacks from `_pendingQueue`, and rejects with a timeout error. No additional queue-timeout mechanism is needed for this dependency behavior.
- **Connection-string application name override:** accepted. node-postgres merges parsed `connectionString` fields after object config, so an `application_name` query parameter could override `application_name: "axtask"`. The runtime helper now removes only that URL parameter before constructing the pool, with focused tests proving unrelated parameters remain.

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

Repository/CI proof can establish the timeout resolution contract, pool wiring, URL-level attribution protection, and TypeScript/build compatibility. It cannot prove provider availability, live 503 recovery, or production deployment/re-entry.
