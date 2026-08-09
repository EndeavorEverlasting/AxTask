# Sprint: AxTask Production Database Recovery and Capacity-Guard Repair

**Date:** 2026-08-09  
**Branch:** `fix/2026-08-08-db-capacity-recovery`  
**Base:** `0536e75` (`origin/main`)

## Incident evidence

Render startup measured a **36.20 GB** PostgreSQL database with
`public.security_events` at **36.19 GB** while normal product tables were measured
in KB/MB. The live event-type composition has not yet been audited, so historical
`api_request` telemetry remains the leading repository-supported hypothesis rather
than a claimed production fact.

Production Render remains **SUSPENDED**. This sprint performs no Render resume,
Neon write, production migration, cleanup, or physical reclaim.

## Delivered

### Capacity guard

`scripts/deploy/check-db-capacity.mjs` now distinguishes three concepts:

- actual database size
- optional explicit operator operational/spend budget
- provider-reported capacity hint

If no operator budget is configured, the gate is report-only. It never invents a
512 MB/10 GiB ceiling. If a budget is present but malformed, the gate fails closed
instead of silently disabling the operator limit. Provider hints are reported
separately and never become the utilization denominator automatically.

### Read-only forensics

`scripts/db-size-audit.mjs --forensics` reports `security_events` relation/heap/
index/TOAST size, live/dead tuples, event-type counts/timestamps, suppression-trigger
state, migration-9999 ledger state, and bloat evidence.

### One-off containment

`scripts/db-contain-api-request.mjs` is a new dry-run-by-default operator command.
With explicit production/non-loopback authorization it installs/verifies only the
`api_request` suppression function and trigger. It deletes no rows, invokes no
general migration runner, bypasses no migration airlock, and does not forge the
migration ledger.

### Targeted logical cleanup

`scripts/db-reclaim-api-request.mjs` deletes only eligible
`event_type='api_request'` rows. Each bounded DELETE batch commits independently;
there is no encompassing giant transaction. CLI retention/batch parameters are
validated and SQL parameters are bound.

### Physical reclaim is separate

`VACUUM FULL` is never a side effect of logical cleanup. It requires a separate
`--vacuum-full --execute --confirm=VACUUM_FULL` maintenance-window invocation and
refuses to run while eligible historical `api_request` rows remain.

### Normal startup remains fail-closed

An earlier draft added `AXTASK_DB_RECOVERY_MODE` to `production-start.mjs` and
called the general migration runner with the migration airlock bypassed. Focused
review rejected that design before PR creation because it could apply every pending
migration while claiming to run only migration 9999.

The hardened branch removes that mode entirely. Normal startup remains:

`environment -> explicit capacity policy -> normal migrations -> guarded Drizzle -> server`

Recovery mutations are separate operator commands only.

### Render configuration

- no baked `AXTASK_DB_SIZE_BUDGET_BYTES`
- malformed explicit budgets fail closed in code
- `autoDeploy: false` during the incident/re-entry window
- `/health` remains DB-free
- `SKIP_DB_PUSH_ON_START=true` remains intact

## Tests

Focused contracts cover:

- absent vs valid vs malformed explicit operator budgets
- 75/85/90 threshold semantics
- provider-hint separation
- read-only forensics surface
- strict loopback/non-loopback mutation gates
- no URL logging
- bounded independent delete batches
- separate physical reclaim confirmation
- no startup recovery/airlock bypass
- one-off containment with no historical deletion
- controlled Render auto-deploy posture

The full repository CI remains authoritative for merge. Local handoff evidence before
GitHub hardening reported TypeScript compile plus 140 deploy-contract tests passing;
GitHub CI must rerun on the repaired exact head.

## Operator workflow

`docs/DB_RECOVERY_RUNBOOK.md` defines R0–R9:

1. Render suspended
2. read-only production forensics
3. containment status decision
4. backup/restore proof
5. targeted logical cleanup if justified by R1
6. physical reclaim only if needed and separately authorized
7. capacity-policy rerun
8. local production certification
9. one controlled Render resume/deploy and observation

The current Render 10 GiB environment value must not be treated as provider truth.
After cleanup, remove it or replace it only if the operator deliberately chooses an
operational/spend ceiling from current provider/budget evidence.

## Proof ceiling

Repository/CI and disposable-local evidence only. This branch cannot claim live
production event composition, backup success, cleanup, physical shrink, deployment,
or production acceptance.
