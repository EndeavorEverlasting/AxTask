# Scheduled and background resource controls

Canonical reference for in-process workers, Render cron jobs, and operator-triggered background work that touches Neon compute or storage. The production posture is **off unless earned**: scheduled work and DB-touching polls must justify their cost before re-enable.

Related: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) §9, [DB_RETENTION_POLICY.md](DB_RETENTION_POLICY.md), [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md), [SCHEMA_EVOLUTION_PIPELINE.md](SCHEMA_EVOLUTION_PIPELINE.md).

## Production defaults (`render.yaml` web service)

After the scheduled-resource-hardening sprint, committed Render env sets:

| Flag | Value |
|------|-------|
| `DISABLE_REMINDER_DISPATCH` | `true` |
| `DISABLE_ARCHETYPE_ROLLUP` | `true` |
| `DISABLE_DB_SIZE_SNAPSHOT` | `true` |
| `DISABLE_OPS_SNAPSHOT` | `true` |
| `SKIP_DB_PUSH_ON_START` | `true` |
| `BACKUP_*_ENABLED` | unset → workers off |

In-process **retention prune** stays **on** (table growth defense). Render **nightly cron** retention stays **on** unless `DISABLE_DB_RETENTION_CRON=true` is set on the cron service.

---

## Feature control matrix

| Feature | Default production | Env flag(s) | Resource | Why mitigated | Re-enable safely | Verification |
|---------|-------------------|-------------|----------|---------------|------------------|--------------|
| Render liveness probe | `/ready` (DB ping) | `healthCheckPath` in `render.yaml` | Neon connections per check | Wakes DB on every rollout/health poll | Merge PR #68: point liveness at `/health`; keep `/ready` for explicit readiness only | Render Events → probe logs; count `/ready` vs `/health` |
| `GET /ready` | Mounted | — | `SELECT 1` per call | Readiness, not liveness | Use for deploy rollback / manual checks only after `/health` liveness | `curl -sS $BASE/ready` |
| `GET /health` | Mounted, DB-free | — | None | Cheap process liveness | Already safe on `main` | `npm run test:deploy:health` |
| Drizzle startup push | **Skipped** on Render | `SKIP_DB_PUSH_ON_START=true`, `AXTASK_ALLOW_DB_PUSH_ON_START` | Schema churn, interactive failures | Runtime schema mutation unsafe | Never on production startup; use `migrations/*.sql` + `apply-migrations.mjs` | Boot log from `production-start.mjs`: push skipped |
| SQL migrations | On boot | `DATABASE_URL` | DDL + brief compute | Required for schema evolution | Review migration in PR; run `npm run db:migrate` locally first | `[migrations] applied` in startup logs |
| Security events (`api_request`) | **On** (1 row/API) | — (follow-up PR) | DB writes, table growth | Unbounded telemetry pressure | Defer to security-log volume PR: sampling/caps | Admin storage tab row counts |
| Security logs (audit) | On (low volume) | — | DB writes | Admin/auth audit trail | Keep; ensure retention cron healthy | `GET /api/admin/security-events` |
| Console `/api` access logs | On | — | Log volume | Render log ingest cost | No decorative fields; no bodies | Stdout: `{method} {path} {status} in {ms}ms` |
| Ops stdout snapshot ticker | **Off** when flag set | `DISABLE_OPS_SNAPSHOT=true`, `OPS_SNAPSHOT_INTERVAL_MS` | Stdout JSON every 24h (PR #68) | Decorative unless tied to alerts | Enable after PR #68 merges + budget review | Log: `event":"axtask.ops.snapshot"` |
| Usage DB snapshot (`usage_snapshots`) | **Off** (manual capture gated) | `DISABLE_OPS_SNAPSHOT=true` | DB insert on admin action | Operator-triggered writes | Set flag `false`; capture via admin UI once, verify row | `POST /api/admin/usage/capture` → 201 or 503 |
| DB-size snapshot (`db_size_snapshots`) | **Off** on Render | `DISABLE_DB_SIZE_SNAPSHOT=true` | `pg_database_size` + domain scan daily | DB wakeups on idle web instances | Enable when storage trend needed; keep retention prune on | Boot: `[db-size-snapshot] disabled (...)` or tick log |
| In-process retention prune | **On** | `DISABLE_RETENTION_PRUNE=true` | Daily DELETE sweeps | Prevents 512 MB / Neon ceiling surprises | Keep on in production; tune interval only if needed | `[retention-prune]` in logs |
| Render cron retention | **On** (04:15 UTC) | `DISABLE_DB_RETENTION_CRON=true` on cron service | Nightly DELETE batch | Justified cleanup; broader table set than in-process worker | Disable only during incident; re-enable after window alignment PR | `[retention] done. rows_deleted=` |
| Reminder dispatch | **Off** on Render | `DISABLE_REMINDER_DISPATCH=true`, `REMINDER_DISPATCH_INTERVAL_MS`, `REMINDER_DISPATCH_MAX_PER_TICK` | DB scan every 60s default | Continuous scheduled DB work | Enable when push budget proven; set interval ≥5m initially | `[reminders] dispatch disabled (...)` or tick summary |
| Archetype rollup | **Off** on Render | `DISABLE_ARCHETYPE_ROLLUP=true`, `ARCHETYPE_ROLLUP_INTERVAL_MS` | Hourly aggregation DELETE+INSERT | Scheduled analytics compute | Enable when empathy analytics needed; verify salt set | `[archetype-rollup] disabled (...)` |
| Archetype poll scheduler | On unless `0` | `AXTASK_ARCHETYPE_POLL_SCHEDULER=0` | Startup poll window ensure | Low frequency | Disable if community polls not used | Engine no-op in tests |
| Adherence interventions cron | **Off** | `ADHERENCE_INTERVENTIONS_ENABLED=true` | Periodic user evaluation | Opt-in only | Enable with VAPID configured | `[adherence]` tick logs |
| Backup tick scheduler | **Off** | `BACKUP_SCHEDULER_ENABLED=true` | User pagination + backup I/O | Heavy compute/storage | Enable one mode only; see BACKUP_AND_RESTORE.md | Worker start log |
| Backup PG queue worker | **Off** | `BACKUP_QUEUE_WORKER_ENABLED=true` | 30s poll default | Continuous DB poll | Same | Queue worker log |
| Backup BullMQ worker | **Off** | `BACKUP_BULLMQ_ENABLED=true` | Redis + backup I/O | Requires Redis | Same | BullMQ worker log |
| Sidebar wallet poll | On `main` / fixed PR #70 | — (client) | Browser-driven `GET /api/gamification/wallet` every 30s | Global idle-tab DB load | Merge PR #70 | Network tab: no 30s wallet interval |
| Briefing badge poll | On | — (client, follow-up) | `GET /api/planner/briefing` every 60s | Global DB load | Separate client PR | Network tab |
| Adherence nudges poll | On when interventions exist | — (client, follow-up) | 60s interventions fetch | Browser-driven DB | Separate client PR | Network tab |

---

## Re-enable checklist (operator)

1. Confirm Neon compute budget and current `usage_snapshots` / `security_events` row counts.
2. Enable **one** feature at a time; watch Render + Neon metrics for 24h.
3. Prefer longer intervals before removing disable flags entirely.
4. Never re-enable Drizzle push on production startup.
5. After PR #68 merges, switch Render `healthCheckPath` to `/health` before re-enabling heavy background work.

---

## PR stack (do not collapse)

| PR | Role |
|----|------|
| #68 | Visibility: `/health` liveness, route attribution, ops snapshot ticker, usage truth |
| #70 | Client: sidebar wallet 30s poll removal |
| Scheduled resource hardening | This doc + env gates + `render.yaml` disables |
| Future | Security log volume (`api_request` caps, retention window alignment) |
