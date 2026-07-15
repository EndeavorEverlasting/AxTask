# Bounded runtime memory diagnostics

Date: 2026-07-15

## Summary

This branch rebuilds the useful runtime-diagnostic portion of stale PR #59 over current `main`. It does not merge or cherry-pick that branch wholesale.

Included:

- one structured process-memory record during server boot
- bounded memory records for DB-size snapshot work that writes or fails
- bounded memory records for reminder dispatch only when work is found or delivery fails
- dedicated deploy-log buckets for startup Drizzle TTY failures and runtime Node heap exhaustion
- sanitized fixtures and tests

Not included:

- Docker, Render, or production-start changes
- worker-control changes already present on `main`
- telemetry database writes
- provider-usage work from PR #68
- high-frequency logs for idle worker ticks

## Runtime record

The event name is `axtask.runtime.memory`. Records contain an operation label, outcome, duration, process metadata, numeric MiB snapshots, and memory deltas. Diagnostic collection and output failures are non-blocking. Wrapped operation failures are still rethrown.

## Classifier contract

- `STARTUP_TTY_INTERACTIVE_PROMPT` requires both a TTY warning and a Drizzle push or schema-sync signature.
- `RUNTIME_OOM` recognizes canonical Node/V8 heap exhaustion signatures.
- Existing capacity, migration, environment, build, startup, health, and smoke precedence is preserved.

## Rollout

Merge only after targeted tests, typecheck, full tests, release validation, build, Docker proof, and standard CI pass. After deployment, observe naturally occurring records; do not enable extra workers just to create telemetry.

## Rollback

Revert this PR. No schema, migration, environment, or persisted-data rollback is required.

## Proof ceiling

Repository checks can prove record shape, bounded emission, failure preservation, classifier precedence, type safety, and build compatibility. Production memory behavior remains unproven until deployment and observation.
