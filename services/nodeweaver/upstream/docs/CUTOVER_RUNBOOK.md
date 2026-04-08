# NodeWeaver Zero-Downtime Cutover Runbook

This runbook publishes NodeWeaver without risking AxTask uptime and keeps Replit fallback available.

## 1) Preconditions

- AxTask is already live and stable on primary host.
- Replit remains untouched as fallback.
- NodeWeaver branch `feature/axtask-contract-hardening` is deployed to provider URL.
- Managed Postgres is provisioned and reachable.

## 2) Required environment settings

- `DATABASE_URL`
- `SESSION_SECRET`
- `PORT=5000`
- `FLASK_ENV=production`
- `FLASK_DEBUG=false`

Dependency gate before release:
- `axios` must not be introduced or invoked in app/tooling paths; block release if detected.

## 3) Health and readiness checks

- `GET /health` must return `200`.
- `GET /api/v1/version` must return expected app/api version.
- Run one classifier request with AxTask-shaped payload and verify category normalization.

## 4) Integration smoke test (AxTask contract)

- Send batch payload containing `activity`, `notes`, `prerequisites`.
- Verify metadata preservation and AxTask-safe labels.
- Confirm p95 latency is acceptable under expected concurrency.

## 5) DNS/traffic introduction

1. Use low TTL (300) before changing DNS.
2. Route a small traffic slice first if provider supports weighted routing.
3. Keep Replit record documented for instant rollback.

## 6) Immediate rollback

Rollback triggers:
- Elevated 5xx
- Contract mismatch with AxTask
- DB availability issues

Rollback steps:
1. Shift DNS back to Replit target.
2. Validate `/health` on fallback.
3. Keep new host running for forensic debugging.
4. Log failing payload examples and timestamps.

## 7) Stabilization window

- Keep Replit warm for 7 days.
- Keep budget alerts and daily usage digest active.
- Avoid schema-breaking changes until rollback confidence is validated.
