# Hosting decision matrix

**Do not migrate until 14 days of ops snapshots exist.** Fill the *Evidence* column from Render logs (`axtask.ops.snapshot`) and Neon Console.

## Current posture (May 2026)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| App host | Render **Starter** | Free tier suspension; temporary band-aid |
| Database | Neon **Free/Launch** | Cheap; separate audit from Render |
| Observability | Structured stdout + `/ops/status` | No paid APM unless metrics prove need |

## Decision table

| Stack | Use if | Avoid if | Evidence (fill after telemetry) |
|-------|--------|----------|-----------------------------------|
| Render Starter + Neon Free | Low maintenance, deploy speed OK | Render cost or opacity painful | |
| Vercel Hobby + Neon Free | App becomes serverless-friendly | Long-running Express + WS required | |
| Oracle Always Free VPS + Neon | Max free compute; OK with SSH/patch | Don't want server chores | |
| Cheap VPS + Neon | Low cost + control | Don't want Docker/nginx/systemd | |

## Metrics to collect (14-day window)

| Metric | Source | Target (10–20 users/mo) |
|--------|--------|-------------------------|
| Render instance hours | Render billing | Within Starter plan |
| Neon compute hours | Neon Console | Within free tier |
| Neon storage | Neon Console + `db_size_snapshots` | < plan limit |
| Health check % of traffic | `axtask.ops.snapshot` | < 50% after `/health` switch |
| Daily boots | `axtask.ops.snapshot` | ≤ 1 typical |
| 5xx / day | `axtask.ops.snapshot` | 0 |
| p95 API latency | Admin performance heuristics | Stable, no regression |

## Review date

- **Start telemetry:** _date deployed_
- **Review decision:** _+14 days_
- **Outcome:** _stay / migrate / downgrade cron_

## Related

- [`RENDER_NEON_OPERATIONS_AUDIT.md`](RENDER_NEON_OPERATIONS_AUDIT.md)
- [`INCIDENT_2026-05_RENDER_OUTAGE.md`](INCIDENT_2026-05_RENDER_OUTAGE.md)
