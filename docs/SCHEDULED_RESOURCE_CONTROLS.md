# Scheduled and background resource controls

Canonical reference for in-process workers, Render cron jobs, browser polling, and operator-triggered background work that touches Neon compute or storage. The production posture is **off unless earned**: scheduled work and DB-touching polls must justify their cost before re-enable.

Related: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) §9, [DB_RETENTION_POLICY.md](DB_RETENTION_POLICY.md), [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md), [SCHEMA_EVOLUTION_PIPELINE.md](SCHEMA_EVOLUTION_PIPELINE.md).

## Production defaults (`render.yaml` web service)

After the recovery and scheduled-resource-hardening train, committed Render configuration sets:

| Control | Value |
|---------|-------|
| Render liveness | `/health` (DB-free) |
| Explicit DB readiness | `/ready` (manual/deploy smoke only) |
| `DISABLE_REMINDER_DISPATCH` | `true` |
| `DISABLE_ARCHETYPE_ROLLUP` | `true` |
| `DISABLE_DB_SIZE_SNAPSHOT` | `true` |
| `DISABLE_OPS_SNAPSHOT` | `true` |
| `SKIP_DB_PUSH_ON_START` | `true` |
| `SECURITY_API_REQUEST_LOGGING` | unset/false |
| `BACKUP_*_ENABLED` | unset → workers off |

In-process **retention prune** stays **on** as table-growth defense. Render **nightly cron** retention stays **on** unless `DISABLE_DB_RETENTION_CRON=true` is set on the cron service.

---

## Feature control matrix

| Feature | Default production | Env flag(s) | Resource | Why mitigated | Re-enable safely | Verification |
|---------|-------------------|-------------|----------|---------------|------------------|--------------|
| Render liveness probe | `/health` | `healthCheckPath` in `render.yaml` | No Neon query | Platform liveness must not wake the DB | Keep `/health`; never substitute `/ready` for routine liveness | Deploy contract plus Render probe logs |
| `GET /ready` | Mounted, explicit | — | `SELECT 1` per call | Readiness, not liveness | Use for deploy smoke and operator DB checks only | `curl -sS $BASE/ready` |
| `GET /health` | Mounted, DB-free | — | None | Cheap process liveness | Already safe on `main` | `npm run test:deploy:health` |
| Drizzle startup push | **Skipped** on Render | `SKIP_DB_PUSH_ON_START=true`, `AXTASK_ALLOW_DB_PUSH_ON_START` | Schema churn, interactive failures | Runtime schema mutation is unsafe | Never on production startup; use `migrations/*.sql` + `apply-migrations.mjs` | Boot log from `production-start.mjs`: push skipped |
| SQL migrations | On boot when pending | `DATABASE_URL` | DDL + brief compute | Required for versioned schema evolution | Review migration in PR; run `npm run db:migrate` locally first | `[migrations] applied` or no-pending log |
| Security events (`api_request`) | **Off** | `SECURITY_API_REQUEST_LOGGING` unset/false plus migration `9999` DB guard | No normal per-request security-event write | One row per API request caused unbounded telemetry pressure | Do not enable in production; use bounded stdout/route attribution instead | `server/api-request-logging.contract.test.ts`; migration `9999` present |
| Security logs (meaningful audit) | On, retained | — | Bounded DB writes | Admin/auth/security audit trail | Keep; ensure retention remains healthy | `GET /api/admin/security-events` and retention logs |
| Console `/api` access logs | On | — | Render log volume | Needed for request diagnosis, but can become noisy | Keep normalized method/path/status/duration only; no bodies or secrets | Sanitized stdout request lines |
| Ops stdout snapshot ticker | **Off** | `DISABLE_OPS_SNAPSHOT=true`, `OPS_SNAPSHOT_INTERVAL_MS` | Periodic stdout | Decorative unless tied to an operator decision | Enable one bounded interval only after budget review | `event":"axtask.ops.snapshot"` absent while disabled |
| Usage DB snapshot (`usage_snapshots`) | Manual/explicit | `DISABLE_OPS_SNAPSHOT=true` where applicable | DB insert on operator action | Avoid automatic telemetry accumulation | Capture only from an explicit admin action and validate resulting row | Admin usage capture response |
| DB-size snapshot (`db_size_snapshots`) | **Off** on Render | `DISABLE_DB_SIZE_SNAPSHOT=true` | `pg_database_size` + domain scan | Scheduled DB wakeups on idle web instances | Enable temporarily when storage trend evidence is required | Boot: `[db-size-snapshot] disabled (...)` |
| In-process retention prune | **On** | `DISABLE_RETENTION_PRUNE=true` | Daily DELETE sweeps | Prevents append-only table growth | Keep on in production; tune interval only with evidence | `[retention-prune]` log |
| Render cron retention | **On** (04:15 UTC) | `DISABLE_DB_RETENTION_CRON=true` on cron service | Nightly DELETE batch and service wake | Justified cleanup with an explicit schedule | Disable only during an incident or maintenance conflict | `[retention] done. rows_deleted=` |
| Reminder dispatch | **Off** on Render | `DISABLE_REMINDER_DISPATCH=true`, `REMINDER_DISPATCH_INTERVAL_MS`, `REMINDER_DISPATCH_MAX_PER_TICK` | Repeated DB scan | Continuous scheduled DB work | Enable one feature at a time with interval ≥5m and a 24h budget observation | `[reminders] dispatch disabled (...)` |
| Archetype rollup | **Off** on Render | `DISABLE_ARCHETYPE_ROLLUP=true`, `ARCHETYPE_ROLLUP_INTERVAL_MS` | Periodic aggregation and writes | Scheduled analytics compute | Enable only when the feature is actively needed and budgeted | `[archetype-rollup] disabled (...)` |
| Archetype poll scheduler | On unless `0` | `AXTASK_ARCHETYPE_POLL_SCHEDULER=0` | Startup schedule ensure | Low frequency but still optional | Disable when community polls are unused | Engine no-op contract/tests |
| Adherence interventions cron | **Off** | `ADHERENCE_INTERVENTIONS_ENABLED=true` | Periodic user evaluation | Opt-in scheduled feature | Enable only with active product use and VAPID configured | `[adherence]` tick logs |
| Backup tick scheduler | **Off** | `BACKUP_SCHEDULER_ENABLED=true` | User pagination + backup I/O | Heavy compute/storage | Enable one backup mode only; see `BACKUP_AND_RESTORE.md` | Worker start log |
| Backup PG queue worker | **Off** | `BACKUP_QUEUE_WORKER_ENABLED=true` | Continuous DB queue poll | Constant DB activity | Enable only with a proven queue workload | Queue worker log |
| Backup BullMQ worker | **Off** | `BACKUP_BULLMQ_ENABLED=true` | Redis + backup I/O | External service and compute cost | Enable only when Redis-backed mode is selected | BullMQ worker log |
| Sidebar wallet poll | **Off** on `main` | Query config | Browser-driven wallet reads | Global idle-tab DB load | Keep mutation invalidation and ordinary staleness | `sidebar.wallet-poll.test.ts`; no 30s Network interval |
| Briefing badge poll | On | Client follow-up | `GET /api/planner/briefing` every 60s | Global browser-driven DB load | Separate bounded client PR; hide-tab gate or manual refresh | Network observation plus route attribution |
| Adherence nudges poll | On when mounted | Client follow-up | Interventions fetch every 60s | Browser-driven DB work | Separate bounded client PR; skip when hidden | Network observation plus route attribution |

---

## Re-enable checklist

1. Confirm Neon compute budget and current table-growth evidence.
2. Enable **one** scheduled feature at a time and observe it for at least 24 hours.
3. Prefer longer intervals before removing a disable flag.
4. Never re-enable Drizzle push on production startup.
5. Keep Render liveness on `/health`; use `/ready` only for explicit DB readiness.
6. Preserve migration `9999` and keep `SECURITY_API_REQUEST_LOGGING` unset or false.

---

## Recovery and salvage map

| Work | Status and role |
|------|-----------------|
| PR #72 | Merged application-side `api_request` logging gate plus migration `9999` containment |
| PR #73 | Merged scheduled worker and snapshot resource controls |
| PR #74 | Merged sidebar wallet interval removal |
| DB-free Render liveness | Current bounded floor repair: `healthCheckPath: /health` |
| PR #68 | Draft, non-mergeable, quarantined salvage source; never merge wholesale |
| Future browser work | Briefing and adherence polling mitigation |
| Future observability | Bounded runtime memory diagnostics and deploy-failure classification |
