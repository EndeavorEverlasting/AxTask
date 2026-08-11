# Runtime database resilience and low-cost diagnostics

## Purpose

AxTask depends on PostgreSQL for authenticated application state. A short database outage must not look like an unexplained application failure, and the application's own diagnostics must not add pressure to a database that is already unavailable or overloaded.

This contract keeps the response bounded and cheap:

- classify database/runtime failures into a small stable taxonomy;
- bound database connection acquisition instead of inheriting an unlimited wait;
- tag runtime PostgreSQL sessions with `application_name=axtask` for cheap attribution;
- emit structured process logs with pool counts instead of full SQL or parameters;
- keep `/health` DB-free for process liveness;
- make `/ready` perform only `SELECT 1` and return coarse database diagnostics;
- convert database-backed API failures into structured HTTP 503 responses;
- retry safe read queries at most twice when the server marks the failure retryable;
- never automatically retry mutations;
- never append a new `security_events` row for an error caused by the database itself;
- avoid querying the failing DB to discover admin-alert recipients during a DB incident.

This is application resilience and observability. It does not replace PostgreSQL/Neon provider availability guarantees and does not claim production recovery proof until the branch is deployed and observed.

## Failure taxonomy

`server/db-runtime.ts` owns the runtime classification contract.

| Class | Typical signals | Client retryable? |
| --- | --- | --- |
| `DB_CONNECTION_FAILED` | SQLSTATE `08xxx`, `ECONNREFUSED`, `ECONNRESET`, server shutdown/cannot-connect states | yes |
| `DB_TIMEOUT` | connection/acquisition timeout, `ETIMEDOUT`, statement timeout | yes |
| `DB_POOL_EXHAUSTED` | SQLSTATE `53300`, too many clients/connections | yes |
| `DB_LOCK_CONTENTION` | lock timeout / deadlock | yes |
| `DB_AUTH_FAILED` | SQLSTATE class `28` | no |
| `DB_CAPACITY_LIMIT` | SQLSTATE `53100`, Neon project-size limit | no |
| `DB_SCHEMA_MISMATCH` | missing relation/column | no |
| `DB_UNKNOWN` | other PostgreSQL SQLSTATE | no |

Unknown application exceptions return `null` from the DB classifier and retain the normal application error path.

The taxonomy deliberately omits raw SQL, parameters, connection strings, usernames, passwords, and hostnames.

## Pool connection boundary

`server/db.ts` gives the runtime pool a finite `connectionTimeoutMillis` instead of node-postgres's no-timeout default.

- default: `5000` ms;
- override: `AXTASK_DB_CONNECTION_TIMEOUT_MS`;
- minimum accepted value: `1000` ms;
- maximum accepted value: `30000` ms;
- invalid values fall back to `5000` ms.

The pool also sets `application_name: "axtask"`. That makes AxTask connections attributable in PostgreSQL activity/provider views without adding an observability vendor or writing telemetry rows.

The timeout bounds connection acquisition; it is **not** a blanket SQL statement timeout and does not change transaction semantics.

## HTTP behavior

### `/health`

`GET /health` remains DB-free. Render uses this endpoint for routine process liveness so a temporary database outage does not cause the platform to treat a healthy Node process as dead.

### `/ready`

`GET /ready` calls `probeDatabase(pool)`, which performs only:

```sql
SELECT 1;
```

Successful readiness includes DB latency. Failed readiness returns HTTP 503 with the coarse `errorClass` and `retryable` fields. Retryable failures also include `Retry-After: 2`.

No pool counters, SQL text, or connection information are exposed in the public response. Pool counts are emitted only to process logs.

### API failures

The central Express error handler classifies PostgreSQL/network errors before responding. Database incidents with a server-side status become HTTP 503 and return a privacy-safe shape:

```json
{
  "message": "Service temporarily unavailable",
  "errorClass": "DB_CONNECTION_FAILED",
  "retryable": true,
  "requestId": "..."
}
```

The request ID is the existing privacy-safe monitoring correlation ID.

### Registration failures

Registration keeps Zod/input validation failures at HTTP 400. Database, network, and post-registration session failures are forwarded to the central error handler instead of being mislabeled as client input errors.

The append-only `auth_register_success` security event is best-effort after account creation. A failure to append that non-essential audit event is logged but does not become a signup dependency.

## Client retry boundary

`client/src/lib/queryClient.ts` converts non-OK responses into `ApiError` with status, error class, retryability, and request ID.

React Query retries only when all of these are true:

1. the operation is a query/read;
2. the response is HTTP 503;
3. the response is retryable (or an upstream 503 has no structured body);
4. fewer than two retries have already been attempted.

Retry delays are bounded at 250 ms, then 500 ms (hard ceiling 1 second).

Mutations keep `retry: false`. AxTask must not replay writes after an ambiguous database failure because the server may have committed the write before the connection failed.

## Structured log events

### `db_pool_error`

Emitted by `server/db.ts` for unexpected pool errors.

Fields:

- `errorClass`
- `retryable`
- PostgreSQL/network `code` when present
- pool `totalCount`, `idleCount`, `waitingCount`

### `db_readiness_failed`

Emitted when `/ready` cannot reach PostgreSQL.

Fields:

- `errorClass`
- `retryable`
- `code`
- readiness latency
- pool counts

### `db_runtime_failure`

Emitted when an API request fails because of a classified database error.

Fields:

- request ID
- route and method
- `errorClass`
- `retryable`
- `code`
- pool counts

These events are deliberately low-cardinality. They do not emit SQL, bind parameters, response bodies, or connection strings.

## Failure amplification guard

The prior recovery incident demonstrated that append-only `security_events` growth is operationally significant. A database outage must therefore not cause the API error handler to attempt another database write for every failed request.

For classified DB incidents:

- `security_events` append is skipped;
- process logging remains available;
- admin alerts remain deduplicated;
- if `ADMIN_ALERT_EMAILS` is configured, email can still be attempted;
- webhook alerts remain available;
- DB lookup of admin recipient addresses is intentionally skipped.

For non-DB application errors, the existing `security_events` audit path remains, and its asynchronous failure is explicitly caught so it cannot become an unhandled rejection.

## Cost posture

This slice adds no paid APM dependency and no persistent telemetry table.

It does **not** enable:

- full production SQL logging;
- Drizzle query logging;
- request/response body logging;
- parameter logging;
- per-query persistent telemetry;
- `pg_stat_statements` collection changes;
- a new monitoring vendor.

The incremental cost is a small number of structured log lines on failures/readiness checks plus at most two extra GET/read requests during a retryable 503 window. The pool timeout and `application_name` tag do not create a new periodic workload.

## Operator incident workflow

When users report a 503:

1. Confirm `/health` separately from `/ready`.
2. Find `db_runtime_failure`, `db_readiness_failed`, or `db_pool_error` entries around the incident timestamp.
3. Group by `errorClass` rather than raw message text.
4. Check pool counts:
   - high `waitingCount` with no idle clients suggests pool pressure;
   - low/zero pool usage with connection errors suggests provider/network reachability;
   - repeated `DB_TIMEOUT` near the configured connection-acquisition bound suggests slow/unavailable connection establishment or pool starvation;
   - capacity/schema/auth classes are non-retryable and require operator correction.
5. Correlate affected API errors by `requestId`.
6. Use `application_name=axtask` when filtering PostgreSQL activity/provider connection views.
7. Continue to use the protected R1-R7 database-recovery gates for any production DB mutation or recovery work. Runtime diagnostics do not authorize those actions.

## Safety boundaries

This work does not:

- mutate production PostgreSQL data or schema;
- change Drizzle push/migration policy;
- change Render auto-deploy/re-entry posture;
- retry application writes;
- enable destructive cleanup;
- expose secrets;
- claim the 2026-08-11 transient 503 root cause beyond the evidence available from runtime behavior.
