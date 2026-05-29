# Render and Neon operations audit

Use this checklist after incidents or before hosting decisions. **Render usage and Neon usage are separate** — do not blame one for the other's bill.

## Render service inventory

| Item | Where to check | Expected / action |
|------|----------------|-------------------|
| Production web | Dashboard → Services → `axtask-prod` | **Starter** plan; only production web app |
| Start command | Service → Settings | `npm run start` → `production-start.mjs` (no drizzle push) |
| Build command | Service → Settings | `npm ci && npm run build` only |
| Health check path | Events → Settings | **`/health`** (must not hit DB) |
| `/ready` smoke | Manual after deploy | `curl https://axtask.app/ready` — DB reachable |
| Cron `axtask-db-retention` | [`render.yaml`](../render.yaml) | Daily 04:15 UTC; justify Starter cost or suspend |
| Forgotten web services | Workspace → Services | Suspend/delete experiments |
| Background workers | Workspace → Services | None expected — disable strays |
| Preview environments | Workspace settings | Disable during stabilization |
| Auto deploy | [`render.yaml`](../render.yaml) `autoDeploy` | `true` today; flip `false` for migration freeze |
| Restart history | Service → Logs / Events | Investigate crash loops |
| Failed deploys | Service → Events | Reduce churn if repeated |
| Free tier hours | Billing (if any free services remain) | Must be zero for prod |

## Render env verification

Run locally (keys only, no secret values):

```bash
npm run env:audit:strict
```

Critical production keys (see [`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md)):

| Variable | Posture |
|----------|---------|
| `SKIP_DB_PUSH_ON_START` | `true` |
| `REGISTRATION_MODE` | `invite` for personal app (or unset → prod defaults invite) |
| `INVITE_CODE` | ≥8 chars when invite mode |
| `OPS_STATUS_TOKEN` | Random bearer for `GET /ops/status` |
| `AUTH_AUDIT_PEPPER` | ≥20 chars |
| `TOTP_ENCRYPTION_KEY` | Exactly 64 hex chars |

Bootstrap helper: `npm run render:env-bootstrap -- --domain=axtask.app --invite --force` (never commit output).

## Neon audit (Console → Usage)

| Metric | Action if high |
|--------|----------------|
| Compute hours | Check `/ready` polling removed from Render; review cron + retention ticks |
| Storage | `npm run db:size-audit`; admin Storage trend (`db_size_snapshots`) |
| Active branches | Delete stale dev branches |
| Connection spikes | Review pool size, health check path, background workers |
| Wake/sleep pattern | Free tier sleep — expect cold starts after idle |

**Do not upgrade Neon** until metrics show sustained pressure at 10–20 users/month.

## In-app telemetry (no extra SaaS cost)

| Signal | Source |
|--------|--------|
| Boot | Render logs: `event":"axtask.boot"` |
| Requests | Render logs: `event":"http.request"` |
| Daily rollup | Render logs: `event":"axtask.ops.snapshot"` |
| Live counters | `GET /ops/status` with `Authorization: Bearer $OPS_STATUS_TOKEN` |
| Deep API perf | Admin → `/api/admin/performance/heuristics` (DB-backed) |

## Alert thresholds (log warnings in snapshot)

- Boots > 3 per 24h window
- 5xx > 5 per 24h
- Health checks > 80% of traffic
- Memory RSS rising across snapshots (manual review)

## Related docs

- [`INCIDENT_2026-05_RENDER_OUTAGE.md`](INCIDENT_2026-05_RENDER_OUTAGE.md)
- [`HOSTING_DECISION_MATRIX.md`](HOSTING_DECISION_MATRIX.md)
- [`SCHEMA_EVOLUTION_PIPELINE.md`](SCHEMA_EVOLUTION_PIPELINE.md)
