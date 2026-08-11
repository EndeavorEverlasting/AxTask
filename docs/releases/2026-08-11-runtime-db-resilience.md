# Runtime DB resilience and transient 503 hardening — 2026-08-11

## Incident signal

On 2026-08-11 AxTask returned HTTP 503s and later recovered without a code change. That behavior is consistent with temporary database unavailability, but the exact provider/root cause is not proven from repository evidence alone.

The existing deployment floor already keeps Render liveness on DB-free `/health`, keeps `/ready` as explicit PostgreSQL readiness, disables Render auto-deploy during the recovery incident, and skips production Drizzle push by default. This release therefore does not reopen the old Drizzle-startup repair or change migration/re-entry policy.

## Scope

This release hardens the runtime seam between AxTask, PostgreSQL, and the browser:

- adds a privacy-safe operational DB failure taxonomy while leaving ordinary SQL constraint/application errors on their normal path;
- bounds runtime DB connection acquisition at 5 seconds by default, configurable from 1–30 seconds;
- tags PostgreSQL runtime sessions with `application_name=axtask` for cheap attribution;
- bounds readiness `SELECT 1` with a readiness-only 2-second query timeout;
- single-flights readiness probes and briefly caches success/failure results to avoid outage amplification;
- adds structured pool/readiness diagnostics;
- enriches `/ready` with latency and coarse failure classification;
- maps propagated runtime DB failures to actionable HTTP 503 responses;
- reclassifies legacy generic API 5xx responses only when a bounded DB probe confirms database unavailability;
- retries only the built-in GET query path, at most twice, and only for explicitly retryable DB-classified 503s;
- keeps mutations and POST-backed custom query functions non-retried;
- routes registration DB/session failures into the classified 503 path instead of mislabeling them as HTTP 400;
- makes the append-only registration audit event best-effort so `security_events` is not a signup dependency;
- prevents DB-caused API errors from recursively appending to `security_events`;
- prevents DB-incident alerting from querying the failing database for recipient discovery;
- keeps the admin-alert channel restricted to HTTP 5xx incidents;
- documents the low-cost incident workflow.

## User impact

Short retryable DB interruptions can now be absorbed by up to two retries on AxTask's built-in GET query path (250 ms then 500 ms) instead of immediately turning every safe GET into a user-visible failure. Unstructured or unrelated 503s are not retried.

If the interruption persists, DB-confirmed callers receive a stable 503 response with `errorClass`, `retryable`, and request correlation rather than an opaque server error. Legacy handlers that consumed their original exception can join this path only when a bounded readiness probe independently confirms the DB is unavailable; otherwise their original 5xx remains unchanged.

Runtime connection acquisition no longer inherits node-postgres's unlimited-wait default. `AXTASK_DB_CONNECTION_TIMEOUT_MS` defaults to 5000 ms and is clamped between 1000 and 30000 ms. Readiness also has a 2-second query-local timeout and short single-flight cache, so health checks cannot multiply an outage into additional repeated pool work.

Registration keeps genuine Zod/input validation failures at HTTP 400, while PostgreSQL/network/session failures are forwarded to the central runtime classifier. This prevents a backend outage from being presented to a prospective user as though their registration request were invalid.

Writes and POST-backed custom queries are deliberately not retried. An ambiguous side-effecting request may already have completed before the connection or response failed, so replay could duplicate user actions, external cost, or telemetry.

## Operational impact

The DB layer emits low-cardinality structured events:

- `db_pool_error`
- `db_readiness_failed`
- `db_runtime_failure`
- `db_fallback_5xx_reclassified`

Each event uses failure class, code, request correlation where available, and/or pool counts. No SQL, bind parameters, connection strings, or request bodies are logged.

The runtime pool uses `application_name=axtask`, making its sessions identifiable in PostgreSQL activity/provider views without adding a vendor or persistent telemetry workload.

Database incidents bypass the DB-backed `security_events` append path and are marked as already emitted before response completion, avoiding recursive pressure and duplicate append-only storage growth during an outage. Admin alert dedupe remains in place, HTTP 4xx responses are ignored by the alert channel, and DB incidents use configured email/webhook destinations without attempting a DB recipient lookup.

Registration no longer waits on its non-essential `auth_register_success` audit append before starting the session/login path. Audit append failures are logged, while the created account can continue through normal login handling. Session/login failures themselves are forwarded to the central error path instead of becoming an opaque registration-specific 500.

## Review-driven corrections

The final branch incorporates review findings that materially narrowed the first implementation:

- unrecognized SQLSTATEs such as `23505` are no longer treated as DB outages;
- uncoded socket-like messages are not classified globally as DB failures;
- readiness is bounded, single-flight, and cached;
- unstructured 503s are no longer automatically retried;
- POST-backed React Query query functions do not inherit GET retry behavior;
- HTTP 4xx errors cannot trigger admin-alert DB recipient work;
- centralized 5xx responses are marked before finish hooks can append duplicate DB-backed audit events;
- core/legacy generic 5xx responses are reclassified only after independent DB readiness confirmation;
- the `/ready` secret-leak contract now fails if its handler extraction fails instead of passing vacuously.

## Safety boundary

This release does **not**:

- mutate production PostgreSQL rows or schema;
- change numbered SQL migrations or Drizzle push behavior;
- overlap PR #131 migration-lock/PG19 graph files;
- change Render auto-deploy or resume/deploy the service;
- change DB pool maximum size or provider capacity;
- impose a global statement timeout on normal application queries;
- enable full SQL/Drizzle query logging;
- add a paid observability dependency;
- retry mutations or POST-backed custom queries;
- claim that the 2026-08-11 outage was definitively caused by Neon or another provider.

## Files

Core/runtime:

- `server/db-runtime.ts`
- `server/db-http-resilience.ts`
- `server/db.ts`
- `server/index.ts`
- `server/routes/auth.ts`
- `server/monitoring/admin-alerts.ts`
- `client/src/lib/queryClient.ts`

Tests/contracts:

- `tests/deploy/06-health/health-contract.test.ts`
- `tests/deploy/06-health/db-runtime-resilience.test.ts`
- `tests/deploy/06-health/db-http-resilience.test.ts`
- `client/src/lib/queryClient.db-resilience.test.ts`
- `server/routes/auth-registration-resilience.contract.test.ts`
- `server/monitoring/admin-alerts.test.ts`

Docs:

- `docs/DB_RUNTIME_RESILIENCE.md`
- `docs/releases/2026-08-11-runtime-db-resilience.md`

## Required validation

Focused:

```bash
npm run test:deploy:health
npx vitest run client/src/lib/queryClient.db-resilience.test.ts server/monitoring/admin-alerts.test.ts server/routes/auth-registration-resilience.contract.test.ts tests/deploy/06-health/db-http-resilience.test.ts
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

Repository code/tests/docs and exact-head CI can prove classification boundaries, bounded/single-flight readiness, GET-only retry boundaries, registration error routing, audit/alert amplification guards, privacy contracts, and build compatibility. They cannot prove live provider behavior or production recovery. Production deployment/re-entry and R1–R7 recovery actions remain separately gated by the deployment recovery control plane.
