# AxTask Zero-Downtime Cutover Runbook

> Status: Transitional runbook.  
> Canonical architecture/policy references: `docs/ACTIVE_LEGACY_INDEX.md`, `docs/ARCHITECTURE.md`, `docs/PR_SEGMENTATION.md`.

This runbook keeps Replit online as hot fallback while shifting primary traffic to a new host.

## 1) Preconditions

- Replit production remains untouched and healthy.
- New host deployment is live on provider URL.
- Same database engine/version is available on target.
- DNS provider supports low TTL edits.

## 2) Config guardrails (must be set before traffic)

- `CANONICAL_HOST=<new-primary-domain>`
- `REPLIT_FALLBACK_HOST=<your-repl>.replit.app`
- `FORCE_HTTPS=true`
- `SESSION_SECRET` set to stable 32+ char random value.
- `DATABASE_URL` points to target managed Postgres.

Keep fallback ready:
- Do not delete Replit service.
- Do not rotate fallback credentials during cutover window.

## 3) Health checks

- Liveness: `GET /health` expects `200`.
- Readiness: `GET /ready` expects `200` and DB reachable.

Block DNS change unless both pass for 15+ minutes.

## 4) Smoke test (provider URL first)

- Login works.
- Create/update/complete task works.
- Planner endpoints respond.
- Google Sheets auth/export path works.

## 5) DNS cutover (safe sequence)

1. Lower TTL to 300.
2. Point primary domain to new host.
3. Keep Replit DNS record documented for immediate failback.
4. Monitor for 30-60 minutes:
   - `5xx` error rate
   - login success rate
   - p95 latency
   - DB connection saturation

## 6) Immediate rollback

Trigger rollback if auth or task CRUD regression appears.

1. Restore DNS to Replit target.
2. Confirm Replit `/health` and `/ready`.
3. Keep new host online for debugging (no traffic).
4. Capture incident notes and failing request signatures.

## 7) Post-cutover freeze window

- Keep Replit warm for 7 days.
- No schema-breaking DB changes without rollback script.
- Keep daily backup verification active.

## 8) Migrating user data (Replit DB → Neon)

For moving historical tasks and related data **into** the new primary database while preserving import dedupe and coin-ledger rules, use **JSON export/import** — see [DATA_MERGE_RUNBOOK.md](./DATA_MERGE_RUNBOOK.md). Avoid raw `COPY` of `wallets` / `coin_transactions` for production users.
