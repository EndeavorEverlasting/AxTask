# Runtime DB resilience and transient 503 hardening — 2026-08-11

## Incident signal

On 2026-08-11 AxTask returned HTTP 503s and later recovered without a code change. That behavior is consistent with temporary database unavailability, but the exact provider/root cause is not proven from repository evidence alone.

The existing deployment floor already keeps Render liveness on DB-free `/health`, keeps `/ready` as explicit PostgreSQL readiness, disables Render auto-deploy during the recovery incident, and skips production Drizzle push by default. This release therefore does not reopen the old Drizzle-startup repair or change migration/re-entry policy.

## Scope

This release hardens the runtime seam between AxTask, PostgreSQL, and the browser:

- adds a privacy-safe runtime DB failure taxonomy;
- bounds runtime DB connection acquisition at 5 seconds by default, configurable from 1–30 seconds;
- tags PostgreSQL runtime sessions with `application_name=axtask` for cheap attribution;
- adds structured pool/readiness diagnostics;
- enriches `/ready` with latency and coarse failure classification;
- maps classified runtime DB failures to actionable HTTP 503 responses;
- adds bounded automatic retry for safe read queries only;
- keeps all mutation retries disabled;
- routes registration DB/session failures into the classified 503 path instead of mislabeling them as HTTP 400;
- makes the append-only registration audit event best-effort so `security_events` is not a signup dependency;
- prevents DB-caused API errors from recursively appending to `security_events`;
- prevents DB-incident alerting from querying the failing database for recipient discovery;
- documents the low-cost incident workflow.

## User impact

Short retryable DB interruptions can now be absorbed by up to two read retries (250 ms then 500 ms) instead of immediately turning every read into a user-visible failure. If the interruption persists, callers receive a stable 503 response with `errorClass`, `retryable`, and request correlation rather than an opaque 500.

Runtime connection acquisition no longer inherits node-postgres's unlimited-wait default. `AXTASK_DB_CONNECTION_TIMEOUT_MS` defaults to 5000 ms and is clamped between 1000 and 30000 ms, so a stalled connect/acquisition can become a classified `DB_TIMEOUT` instead of hanging indefinitely.

Registration keeps genuine Zod/input validation failures at HTTP 400, while PostgreSQL/network/session failures are forwarded to the central runtime classifier. This prevents a backend outage from being presented to a prospective user as though their registration request were invalid.

Writes are deliberately not retried. An ambiguous write may already have committed before the connection failed, so automatic mutation retry could duplicate user actions.

## Operational impact

The DB layer emits three low-cardinality structured events:

- `db_pool_error`
- `db_readiness_failed`
- `db_runtime_failure`

Each event uses failure class, code, and pool counts. No SQL, bind parameters, connection strings, or request bodies are logged.

The runtime pool uses `application_name=axtask`, making its sessions identifiable in PostgreSQL activity/provider views without adding a vendor or persistent telemetry workload.

Database incidents bypass the DB-backed `security_events` append path, avoiding recursive pressure and append-only storage growth during an outage. Admin alert dedupe remains in place, and DB incidents use configured email/webhook destinations without attempting a DB recipient lookup.

Registration no longer waits on its non-essential `auth_register_success` audit append before starting the session/login path. Audit append failures are logged, while the created account can continue through normal login handling. Session/login failures themselves are forwarded to the central error path instead of becoming an opaque registration-specific 500.

## Safety boundary

This release does **not**:

- mutate production PostgreSQL rows or schema;
- change numbered SQL migrations or Drizzle push behavior;
- overlap PR #131 migration-lock/PG19 graph files;
- change Render auto-deploy or resume/deploy the service;
- change DB pool maximum size or provider capacity;
- enable full SQL/Drizzle query logging;
- add a paid observability dependency;
- retry writes;
- claim that the 2026-08-11 outage was definitively caused by Neon or another provider.

## Files

- `server/db-runtime.ts`
- `server/db.ts`
- `server/index.ts`
- `server/routes/auth.ts`
- `server/routes/auth-registration-resilience.contract.test.ts`
- `server/monitoring/admin-alerts.ts`
- `client/src/lib/queryClient.ts`
- `tests/deploy/06-health/health-contract.test.ts`
- `tests/deploy/06-health/db-runtime-resilience.test.ts`
- `client/src/lib/queryClient.db-resilience.test.ts`
- `server/monitoring/admin-alerts.test.ts`
- `docs/DB_RUNTIME_RESILIENCE.md`
- `docs/releases/2026-08-11-runtime-db-resilience.md`

## Required validation

Focused:

```bash
npm run test:deploy:health
npx vitest run client/src/lib/queryClient.db-resilience.test.ts server/monitoring/admin-alerts.test.ts server/routes/auth-registration-resilience.contract.test.ts
```

Repository gates:

```bash
npm run check
npm test
npm run build
git diff --check
```

CI on the exact PR head remains the remote proof source when local checkout/runtime proof is unavailable.

## Proof ceiling

Repository code/tests/docs and CI can prove classification, bounded connection acquisition, retry boundaries, registration error routing, privacy contracts, and build compatibility. They cannot prove live provider behavior or production recovery. Production deployment/re-entry and R1-R7 recovery actions remain separately gated by the deployment recovery control plane.
