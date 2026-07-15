# Bounded runtime memory diagnostics

Date: 2026-07-15

## Summary

This branch rebuilds the useful runtime-diagnostic portion of stale PR #59 over current `main`. It does not merge or cherry-pick that branch wholesale.

Included:

- one structured process-memory record during server boot
- bounded records for DB-size snapshot work that writes or fails
- bounded records for reminder dispatch only when work is found or delivery fails
- workload counts that correlate memory movement with actual operations
- conservative pressure signals that narrow the memory domain
- dedicated deployment-log classifications
- sanitized fixtures and tests

Not included:

- Docker, Render, or production-start changes
- worker-control changes already present on `main`
- telemetry database writes
- provider-usage work from PR #68
- high-frequency logs for idle worker ticks

## Runtime record

The event name is `axtask.runtime.memory`. Records contain the operation label, outcome, duration, process metadata, numeric MiB snapshots, V8 heap limit, memory deltas, pressure signals, and bounded scalar workload metrics.

Diagnostic collection and output failures are non-blocking. Wrapped operation failures are still returned to their existing error path.

## Pressure signals

| Signal | Meaning |
|---|---|
| `heap-near-limit` | used JavaScript heap is at least 80 percent of the V8 limit |
| `heap-growth` | the operation increased used heap by at least 8 MiB |
| `array-buffer-growth` | the operation increased array-buffer memory by at least 8 MiB |
| `external-growth` | the operation increased other external memory by at least 8 MiB |
| `rss-unattributed-growth` | RSS increased by at least 16 MiB without matching heap or external growth |

These signals identify an investigation direction. They are not a final diagnosis.

## Workload attribution

Reminder records include the configured batch limit plus scanned, attempted, sent, skipped, and failed counts.

DB-size snapshot records include whether a row was inserted, the result reason, and the measured database-size byte count. The normal daily dedup path remains silent.

Workload output accepts only a small number of scalar fields. Field names and string lengths are bounded before logging.

## Rollout

Merge only after targeted tests, typecheck, full tests, release validation, build, Docker proof, and standard CI pass. After deployment, observe naturally occurring records; do not enable extra workers solely to create telemetry.

Compare operation label, workload volume, pressure signals, host memory, and restart history before drawing a conclusion.

## Rollback

Revert this PR. No schema, migration, environment, or persisted-data rollback is required.

## Proof ceiling

Repository checks can prove record shape, bounded emission, workload filtering, pressure thresholds, failure preservation, type safety, and build compatibility. Production behavior remains unproven until deployment and observation.
