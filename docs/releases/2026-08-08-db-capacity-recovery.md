# Sprint: AxTask Production Database Recovery and Capacity-Guard Repair

**Date:** 2026-08-08
**Branch:** `fix/2026-08-08-db-capacity-recovery`
**Base:** `0536e75` (origin/main)

---

## Summary

This sprint repairs the deployment blocker caused by a 36.20 GB database (36.19 GB from `security_events` table containing unbounded `api_request` telemetry) and rebuilds the capacity guard to never confuse operator budgets with provider limits.

**Production Render remains SUSPENDED. No production mutations performed.**

---

## Changes

### 1. Capacity Guard Redesign (`scripts/deploy/check-db-capacity.mjs`)

**Before:** Hardcoded 512 MB default → HARD_FAIL at 36 GB (362% of invented ceiling)
**After:** No default budget → REPORT-ONLY mode when unset; explicit operator budget enables thresholds

| Behavior | Before | After |
|----------|--------|-------|
| No `AXTASK_DB_SIZE_BUDGET_BYTES` | Invents 512 MB → HARD_FAIL | Reports size + provider hint, no failure |
| Explicit budget set | Uses it | Uses it, labeled "OPERATOR BUDGET" |
| Provider hint (`neon.max_cluster_size`) | Silent, may replace budget | Reported separately, labeled "PROVIDER HINT" |
| Output | Human-only | Machine-readable JSON with all fields |

**Machine-readable fields:**
```json
{
  "dbSize": 36190000000,
  "operatorBudget": 10737418240,
  "operatorBudgetSource": "env:AXTASK_DB_SIZE_BUDGET_BYTES",
  "providerHint": "16 TB",
  "fraction": 3.37,
  "utilizationPercent": "337.0",
  "verdict": "hard_fail",
  "reason": "Database size >= 90% of explicit operator budget.",
  "level": "hard_fail",
  "exitCode": 2
}
```

### 2. Security Events Forensics (`scripts/db-size-audit.mjs --forensics`)

New `--forensics` flag adds deep-dive for `security_events`:
- Relation/heap/index/TOAST size breakdown
- Estimated/live/dead row counts from `pg_stat_user_tables`
- `event_type` counts with oldest/newest timestamps
- Trigger `trg_suppress_api_request_security_events` existence + enabled status
- Migration 9999 recorded status
- Bloat analysis (avg tuple size, expected vs actual heap, dead tuple ratio)
- Live-row vs dead-tuple bloat distinction

### 3. Targeted api_request Recovery (`scripts/db-reclaim-api-request.mjs`)

New safe alternative to `db-reclaim.mjs`:

| Safety Feature | Implementation |
|----------------|----------------|
| Dry-run default | `--execute` required to mutate |
| Explicit confirm | `--confirm=YES` required |
| Production intent | `--prod` or `NODE_ENV=production` required |
| Loopback only | Refuses non-loopback unless `--force-production` |
| Preserves non-api_request | Verified before/after counts |
| Batched deletion | 5000 rows/batch (configurable) |
| Logical-only mode | `--logical-only` skips VACUUM FULL |
| Retention window | `--retention-days=N` (default 1) |
| Idempotent | Re-running deletes 0 rows |

### 4. Deployment Config Correction (`render.yaml`, `scripts/production-start.mjs`)

**render.yaml:**
- Removed baked `AXTASK_DB_SIZE_BUDGET_BYTES=10737418240`
- Added commented example with explicit operator guidance
- Clear distinction: operator budget ≠ provider hint

**production-start.mjs:**
- Added `AXTASK_DB_RECOVERY_MODE=true` for emergency containment
- Recovery mode runs ONLY migration 9999 (suppresses api_request), exits without starting server
- Capacity gate failure now suggests recovery mode
- Normal startup order unchanged: env → capacity → migrations → drizzle → server

### 5. Test Coverage

| Test Suite | Command | Coverage |
|------------|---------|----------|
| Capacity gate contract | `npm run test:deploy:capacity-gate` | 11 scenarios |
| DB audit forensics | `npm run test:deploy:db-audit-forensics` | Script guards |
| Deployment config | `npm run test:deploy:deployment-config` | render.yaml + recovery mode |
| Full deploy suite | `npm run test:deploy` | All gates |

### 6. Documentation

- `docs/DB_RECOVERY_RUNBOOK.md` — Complete R0–R9 recovery procedure
- Exact commands, expected output, rollback, proof ceiling
- AI harness integration notes

---

## Validation

```bash
npm ci                    # Clean install
npm run check             # TypeScript compile
npm run test:deploy       # Full deploy test suite
npm run build             # Production build
```

All tests must pass locally against disposable PostgreSQL before any production action.

---

## Migration Notes

**No schema migrations required.** Migration 9999 already exists on main and remains in force.

**Operator action required for production:**
1. Set `AXTASK_DB_SIZE_BUDGET_BYTES` in Render env to match actual Neon plan
2. Run recovery procedure (R0–R7) against disposable local PostgreSQL first
3. Only then authorize Render resume/deploy

---

## Rollback

- Logical cleanup is idempotent and safe to re-run
- Physical reclaim (`VACUUM FULL`) requires backup restoration (R3)
- Migration 9999 trigger must NEVER be dropped — it's the containment safety boundary

---

## Files Changed

```
scripts/deploy/check-db-capacity.mjs          # Redesigned capacity gate
scripts/db-size-audit.mjs                     # Added --forensics mode
scripts/db-reclaim-api-request.mjs            # NEW: Targeted recovery script
scripts/production-start.mjs                  # Added recovery mode
render.yaml                                   # Removed baked budget, added guidance
package.json                                  # Added test scripts
tests/deploy/11-capacity-gate/                # NEW: Capacity gate tests
tests/deploy/12-db-audit-forensics/           # NEW: Forensics/recovery tests
tests/deploy/13-deployment-config/            # NEW: Deployment config tests
docs/DB_RECOVERY_RUNBOOK.md                   # NEW: Operator runbook
```

---

## Next Steps (Operator)

1. Review `docs/DB_RECOVERY_RUNBOOK.md`
2. Provision disposable local PostgreSQL
3. Seed with `security_events` (api_request + meaningful audit rows)
4. Run R1–R7 locally to prove recovery path
5. Set `AXTASK_DB_SIZE_BUDGET_BYTES` in Render to match Neon plan
6. Authorize single Render resume/deploy
7. Observe 24h (R9)