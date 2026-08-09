# AxTask Database Recovery Runbook
## Production Database Capacity Emergency — 36.20 GB security_events Bloat

**Incident Date:** 2026-08-08
**Status:** Render SUSPENDED — DO NOT RESUME
**Root Cause:** Unbounded `api_request` telemetry writes to `security_events` (36.19 GB of 36.20 GB total)

---

## A. Diagnosis

### Evidence
```
Total database size: 36.20 GB
security_events: 36.19 GB (99.97%)
All other tables: < 1 MB each
```

### Root Cause Analysis
- **NOT** repository image size (Git/Docker assets are ~MB)
- **IS** PostgreSQL database storage bloat from `security_events` table
- `event_type='api_request'` rows: one per normal `/api/*` response
- Migration `9999_disable_api_request_security_events.sql` suppresses NEW inserts but logical DELETE does not physically shrink storage
- Capacity gate (`check-db-capacity.mjs`) compared against hardcoded 512 MB default, not actual Neon plan

### Key Distinction
| Concept | Value | Source |
|---------|-------|--------|
| Git/Docker assets | ~50 MB | Repository |
| PostgreSQL database | 36.20 GB | `pg_database_size()` |
| Operator budget | 10 GB (example) | `AXTASK_DB_SIZE_BUDGET_BYTES` (must be explicit) |
| Provider hint | 16 TB | `neon.max_cluster_size` |

---

## B. Explicit Distinction: Git/Docker ≠ PostgreSQL Storage

```
Repository (Git)          PostgreSQL Database
─────────────────         ───────────────────
Source code               Tables + indexes
Dockerfile                WAL files
Assets                    TOAST tables
~MB                       ~GB (unbounded without retention)
```

**Never** confuse:
- `docker build` size → build artifact
- `git clone` size → source history
- `pg_database_size()` → actual database footprint

---

## C. Recovery Gates (R0–R9)

### R0: Render Suspended ✓
- [ ] Render service `axtask-prod` is **Suspended** in dashboard
- [ ] No auto-deploy can trigger
- [ ] `/health` probe will fail (expected)

### R1: Read-Only Production Audit
```bash
# Run against production DATABASE_URL (READ-ONLY)
node scripts/db-size-audit.mjs --forensics --json > production-audit.json
```
**Expected output:**
- `security_events` relation size: ~36 GB
- `event_type` breakdown showing `api_request` dominant
- `trg_suppress_api_request_security_events`: exists, enabled=O
- `migration 9999`: RECORDED in `applied_sql_migrations`
- Dead tuple ratio: low (live-row bloat, not dead-tuple bloat)

### R2: Containment Verified ✓
- [ ] Migration 9999 applied (trigger suppresses NEW `api_request` inserts)
- [ ] Application-side gate `SECURITY_API_REQUEST_LOGGING` is `false` (default)
- [ ] No new `api_request` rows being written

### R3: Backup/Rollback Evidence
```bash
# Create verified backup before any mutation
npm run db:backup:preflight  # Verifies backup can be created
npm run db:backup            # Creates encrypted, compressed dump
```
**Verify:** `npm run db:restore:test` against disposable local PostgreSQL

### R4: Targeted Logical Cleanup (api_request only)
```bash
# DRY RUN FIRST
node scripts/db-reclaim-api-request.mjs --dry-run --retention-days=1

# EXECUTE (requires explicit confirmation)
node scripts/db-reclaim-api-request.mjs --execute --confirm=YES --prod --retention-days=1
```
**Safety guarantees:**
- ONLY deletes `event_type='api_request'` rows older than 1 day
- PRESERVES all other security events (auth, admin, archetype, etc.)
- Batched deletion (5000 rows/batch) — no long-running transaction
- Emits before/after counts
- Verifies non-api_request count unchanged

### R5: Physical Reclaim (if required)
```bash
# Only if logical cleanup doesn't shrink database enough
node scripts/db-reclaim-api-request.mjs --execute --confirm=YES --prod --retention-days=1
# (VACUUM FULL runs automatically unless --logical-only)
```
**Warning:** `VACUUM FULL` requires exclusive lock on `security_events` — downtime for writes to that table.

**Alternative (Neon):** Neon's `pg_repack` or storage compaction may be safer — investigate before `VACUUM FULL`.

### R6: Capacity Gate Rerun
```bash
node scripts/deploy/check-db-capacity.mjs
```
**Expected:** Level OK or WARN (no longer HARD_FAIL)

### R7: Local Production Certification
```bash
# Against disposable local PostgreSQL seeded with production-like data
AXTASK_LOCAL_CERT=1 node scripts/deploy/run-local-cert.mjs
```
**Must pass:** `/health`, `/ready`, `/` serves client shell

### R8: Authorized Single Render Resume/Deploy
- [ ] Operator explicitly authorizes
- [ ] `AXTASK_DB_SIZE_BUDGET_BYTES` set in Render env to match Neon plan (e.g., 10737418240 for 10 GB)
- [ ] Resume Render service → triggers deploy
- [ ] Deploy runs: env gate → capacity gate (now passes) → migrations → server

### R9: Observation Window
- [ ] Monitor `/api/admin/db-size` (admin + step-up) for 24h
- [ ] Verify `api_request` count stops advancing
- [ ] Verify `api_error` (5xx) still records and notifies admins
- [ ] Verify retention cron (`db-retention.mjs`) runs nightly

---

## D. Exact Commands, Expected Output, Rollback, Proof Ceiling

### Command: Production Audit
```bash
DATABASE_URL=<prod-url> node scripts/db-size-audit.mjs --forensics --json
```
**Expected JSON keys:** `database`, `topTables`, `securityEventsForensics.{relationSize,heapSize,eventTypeCounts,triggerExists,migration9999Recorded,bloatAnalysis}`

### Command: Targeted Cleanup (Dry Run)
```bash
DATABASE_URL=<local-disposable-url> node scripts/db-reclaim-api-request.mjs --dry-run --retention-days=1
```
**Expected:** `dryRun: true`, `deleted: <count>`, `vacuumFull: true`

### Command: Targeted Cleanup (Execute)
```bash
DATABASE_URL=<local-disposable-url> node scripts/db-reclaim-api-request.mjs --execute --confirm=YES --prod --retention-days=1
```
**Expected:** `dryRun: false`, `deleted: <count>`, `after.nonApiRequest === before.nonApiRequest`

### Command: Recovery Mode Startup
```bash
AXTASK_DB_RECOVERY_MODE=true npm run start
```
**Expected:** Runs migration 9999 only, exits 0, prints next steps

### Rollback Procedure
1. **Logical cleanup:** Idempotent — re-running deletes 0 additional rows
2. **Physical reclaim:** `VACUUM FULL` not reversible — rely on backup (R3)
3. **Migration 9999:** NEVER drop trigger during rollback — it's the safety boundary

### Proof Ceiling
| Step | Proof Level |
|------|-------------|
| R1 Audit | Repository evidence |
| R3 Backup | Repository + local restore test |
| R4 Cleanup | Local disposable PostgreSQL |
| R7 Cert | Local-runtime proof |
| R8 Deploy | Deployment authorization (operator) |
| R9 Observe | Live-runtime proof (24h) |

**This runbook establishes repository evidence only.** Live deployment requires separate operator authorization.

---

## E. AI Harness Integration

This recovery workflow is a **special workflow** that cannot be claimed complete from repository tests alone.

### Harness Registration
```json
{
  "id": "axtask.db-recovery.v1",
  "trigger": "capacity-emergency",
  "workflow": "axtask.failure-recovery.v1",
  "requiredGates": ["R1", "R3", "R4", "R6", "R7"],
  "proofCeiling": "local-runtime"
}
```

### Validator Updates
- `test:deploy:capacity-gate` — verifies gate contract
- `test:deploy:db-audit-forensics` — verifies audit script contract
- `test:deploy:deployment-config` — verifies recovery mode wiring
- `predeploy-cost-readiness` — must emit `NOT_READY_REPOSITORY` until R7 passes

---

## Next Production Command (DO NOT EXECUTE)

```bash
# After R7 passes and operator authorizes:
# 1. Set AXTASK_DB_SIZE_BUDGET_BYTES=10737418240 in Render env
# 2. Resume Render service 'axtask-prod'
# 3. Monitor deploy logs for: [db-capacity] Level: OK
```

**This command is documented for operator use only. Do not execute from this repository.**