# Runtime database resilience and low-cost diagnostics

## Purpose

AxTask depends on PostgreSQL for authenticated application state. A short database outage must not look like an unexplained application failure, and the application's own diagnostics must not add pressure to a database that is already unavailable or overloaded.

This contract keeps the response bounded and cheap:

- classify only known operational PostgreSQL/runtime failures into a small stable taxonomy;
- leave ordinary SQL constraint/application errors unclassified instead of promoting them to outages;
- bound new database connection acquisition instead of inheriting an unlimited wait;
- tag runtime PostgreSQL sessions with `application_name=axtask` for cheap attribution;
- make readiness `SELECT 1` bounded, single-flight, and briefly cached;
- emit structured process logs with pool counts instead of full SQL or parameters;
- keep `/health` DB-free for process liveness;
- make `/ready` return coarse database diagnostics;
- reclassify legacy generic API 5xx responses only when a bounded readiness probe confirms database unavailability;
- retry only the built-in GET query path, at most twice, when AxTask explicitly marks a DB 503 retryable;
- never automatically retry mutations or POST-backed custom query functions;
- never append a new `security_events` row for an error caused by the database itself;
- avoid querying the failing DB to discover admin-alert recipients during a DB incident.

This is application resilience and observability. It does not replace PostgreSQL/Neon provider availability guarantees and does not claim production recovery proof until the branch is deployed and observed.

## Failure taxonomy

`server/db-runtime.ts` owns the runtime classification contract.

| Class | Typical signals | Client retryable? |
| --- | --- | --- |
| `DB_CONNECTION_FAILED` | SQLSTATE `08xxx`, `ECONNREFUSED`, `ECONNRESET`, server shutdown/cannot-connect states | yes |
| `DB_TIMEOUT` | connection/acquisition timeout, `ETIMEDOUT`, readiness statement timeout | yes |
| `DB_POOL_EXHAUSTED` | SQLSTATE `53300`, too many clients/connections | yes |
| `DB_LOCK_CONTENTION` | lock timeout / deadlock | yes |
| `DB_AUTH_FAILED` | SQLSTATE class `28` | no |
| `DB_CAPACITY_LIMIT` | SQLSTATE `53100`, Neon project-size limit | no |
| `DB_SCHEMA_MISMATCH` | missing relation/column | no |

Unknown application exceptions and ordinary SQLSTATE constraint errors such as `23505` return `null` from the global DB classifier and retain the normal application error path.

Message-only heuristics are allowed only when the caller already knows the failure came from PostgreSQL, such as the pool error listener or the readiness probe. This prevents an unrelated HTTP/socket failure whose text says "connection refused" from being mislabeled as a DB outage.

The taxonomy deliberately omits raw SQL, parameters, connection strings, usernames, passwords, and hostnames.

## Pool connection boundary

`server/db.ts` gives the runtime pool a finite `connectionTimeoutMillis` instead of node-postgres's no-timeout default.

- default: `5000` ms;
- override: `AXTASK_DB_CONNECTION_TIMEOUT_MS`;
- minimum accepted value: `1000` ms;
- maximum accepted value: `30000` ms;
- invalid values fall back to `5000` ms.

The pool also sets `application_name: "axtask"`. That makes AxTask connections attributable in PostgreSQL activity/provider views without adding an observability vendor or writing telemetry rows.

The timeout bounds new connection acquisition. It is **not** a blanket SQL statement timeout and does not change normal application-query or transaction semantics.

## Readiness behavior

### `/health`

`GET /health` remains DB-free. Render uses this endpoint for routine process liveness so a temporary database outage does not cause the platform to treat a healthy Node process as dead.

### `/ready`

`GET /ready` calls `probeDatabase(pool)`. The probe performs only `SELECT 1` with a readiness-only 2-second query timeout.

The probe is single-flight per pool and caches successful results for about 1 second and failed results for about 5 seconds. Concurrent or rapidly repeated checks therefore share/reuse one result instead of multiplying pressure on a degraded pool.

Successful readiness includes DB latency. Failed readiness returns HTTP 503 with coarse `errorClass` and `retryable` fields. Retryable failures also include `Retry-After: 2`.

No pool counters, SQL text, or connection information are exposed in the public response. Pool counts are emitted only to process logs.

## API failure behavior

The central Express error handler classifies known PostgreSQL/network availability errors before responding. Classified database incidents with a server-side status become HTTP 503 and return a privacy-safe shape:

```json
{
  "message": "Service temporarily unavailable",
  "errorClass": "DB_CONNECTION_FAILED",
  "retryable": true,
  "requestId": "..."
}
```

The request ID is the existing privacy-safe monitoring correlation ID.

Some legacy handlers still catch their original exception and emit a generic JSON 5xx directly. `server/db-http-resilience.ts` handles that boundary conservatively: it probes readiness only for otherwise-unclassified API 5xx responses. If the DB is reachable, the original 5xx is preserved. If the bounded probe confirms DB unavailability, the response is converted to the same structured 503 shape and marked as already emitted so downstream audit hooks do not write a duplicate DB-backed error event.

This fallback does not reclassify 4xx responses and does not infer a DB outage from a generic route error alone.

### Registration failures

Registration keeps Zod/input validation failures at HTTP 400. Database, network, and post-registration session failures are forwarded to the central error handler instead of being mislabeled as client input errors.

The append-only `auth_register_success` security event is best-effort after account creation. A failure to append that non-essential audit event is logged but does not become a signup dependency.

## Client retry boundary

`client/src/lib/queryClient.ts` converts non-OK responses into `ApiError` with status, error class, retryability, and request ID.

Automatic retry is intentionally narrower than "all React Query reads." Only the built-in GET query function opts into DB retry. A retry occurs only when all of these are true:

1. the request is using AxTask's built-in GET query function;
2. the response is HTTP 503;
3. the response contains an `errorClass` beginning with `DB_`;
4. the server explicitly returns `retryable: true`;
5. fewer than two retries have already been attempted.

Retry delays are 250 ms, then 500 ms, with a hard helper ceiling of 1 second.

Unstructured 503 responses are **not** retried. Custom query functions using `apiRequest`, including POST-backed classifier suggestions, do not opt into the retry flag. Mutations keep `retry: false`. AxTask therefore does not replay side-effecting work after an ambiguous database failure.

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

Emitted when a propagated API request fails because of a classified database error.

Fields:

- request ID
- route and method
- `errorClass`
- `retryable`
- `code`
- pool counts

### `db_fallback_5xx_reclassified`

Emitted when a legacy generic API 5xx is converted to 503 only after the readiness probe confirms DB unavailability.

These events are deliberately low-cardinality. They do not emit SQL, bind parameters, response bodies, or connection strings.

## Failure amplification guard

The prior recovery incident demonstrated that append-only `security_events` growth is operationally significant. A database outage must therefore not cause the API error handler to attempt another database write for every failed request.

For classified or DB-confirmed incidents:

- `security_events` append is skipped;
- the request is marked as already emitted before the response finishes;
- process logging remains available;
- admin alerts remain deduplicated;
- if `ADMIN_ALERT_EMAILS` is configured, email can still be attempted;
- webhook alerts remain available;
- DB lookup of admin recipient addresses is intentionally skipped.

For non-DB application errors, the existing `security_events` audit path remains, and its asynchronous failure is explicitly caught so it cannot become an unhandled rejection. The admin-alert channel ignores HTTP 4xx responses entirely.

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

The incremental cost is a small number of structured log lines on failures/readiness checks plus at most two extra GET requests during an explicitly retryable DB 503 window. Readiness single-flight/caching reduces rather than multiplies repeated probe work during an incident.

## Operator incident workflow

When users report a 503:

1. Confirm `/health` separately from `/ready`.
2. Find `db_runtime_failure`, `db_readiness_failed`, `db_pool_error`, or `db_fallback_5xx_reclassified` entries around the incident timestamp.
3. Group by `errorClass` rather than raw message text.
4. Check pool counts:
   - high `waitingCount` with no idle clients suggests pool pressure;
   - low/zero pool usage with connection errors suggests provider/network reachability;
   - repeated `DB_TIMEOUT` near the configured acquisition/readiness bound suggests stalled connection acquisition or DB response;
   - capacity/schema/auth classes are non-retryable and require operator correction.
5. Correlate affected API errors by `requestId`.
6. Use `application_name=axtask` when filtering PostgreSQL activity/provider connection views.
7. Continue to use the protected R1-R7 database-recovery gates for any production DB mutation or recovery work. Runtime diagnostics do not authorize those actions.

## Safety boundaries

This work does not:

- mutate production PostgreSQL data or schema;
- change Drizzle push/migration policy;
- change Render auto-deploy/re-entry posture;
- change DB pool maximum size or provider capacity;
- retry application writes or POST-backed custom queries;
- enable destructive cleanup;
- expose secrets;
- claim the 2026-08-11 transient 503 root cause beyond the evidence available from runtime behavior.
