# Incident: Render Free tier suspension (May 2026)

**Status:** CLOSED (mitigated — upgraded to Render Starter)

## Timeline (operator notes — fill exact UTC timestamps from Render dashboard)

| Phase | What happened |
|-------|----------------|
| Trigger | Render suspended `axtask-prod` on **Free tier** — monthly free instance hours exhausted |
| Secondary failure | Production startup ran `drizzle-kit push`; hit `promptNamedWithSchemasConflict` / **Interactive prompts require a TTY terminal** |
| Env gate failures | After tier upgrade, boot blocked until `AUTH_AUDIT_PEPPER` length and `TOTP_ENCRYPTION_KEY` (64 hex) were corrected on Render |
| Restoration | Upgraded web service to **Starter**; corrected env vars; app live at `axtask.app` |

## Root causes

1. **Operational:** Free tier has no headroom for a always-on personal productivity app.
2. **Startup guardrail gap:** Drizzle schema push on non-interactive boot could block deploy before HTTP bind.
3. **Configuration:** Registration logged `INVITE_CODE` set while `REGISTRATION_MODE=open` (invite ignored).

## Remediation shipped in repo

- [`scripts/production-start.mjs`](../scripts/production-start.mjs) skips Drizzle push on Render / non-TTY by default; [`render.yaml`](../render.yaml) sets `SKIP_DB_PUSH_ON_START=true`.
- Render health check moved to **`/health`** (process liveness, no Neon wake).
- Structured boot/request logs + daily `axtask.ops.snapshot` + protected `GET /ops/status`.
- Migration airlock runs only when **pending** SQL migrations exist (no-op restarts skip backup gate).
- Policy docs: [`SCHEMA_EVOLUTION_PIPELINE.md`](SCHEMA_EVOLUTION_PIPELINE.md), [`RENDER_NEON_OPERATIONS_AUDIT.md`](RENDER_NEON_OPERATIONS_AUDIT.md).

## Operator follow-ups (dashboard, not code)

- [ ] Confirm Render plan = **Starter** for web + justify **cron** (`axtask-db-retention`) cost
- [ ] Set `REGISTRATION_MODE=invite` + strong `INVITE_CODE` on Render if not public signup
- [ ] Run Neon usage audit (see [`RENDER_NEON_OPERATIONS_AUDIT.md`](RENDER_NEON_OPERATIONS_AUDIT.md))
- [ ] Review hosting matrix after 14 days of ops snapshots ([`HOSTING_DECISION_MATRIX.md`](HOSTING_DECISION_MATRIX.md))

## Schema conflict investigation

If `promptNamedWithSchemasConflict` reappears during **manual** `npm run db:push` (never on prod boot):

```sql
SELECT schema_name FROM information_schema.schemata ORDER BY 1;
SELECT table_schema, table_name FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;
SELECT filename, applied_at FROM applied_sql_migrations ORDER BY applied_at;
```

Reconcile from an interactive shell against a **Neon branch clone**, not blind prod push.
