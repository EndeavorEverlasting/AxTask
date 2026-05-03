# Browser-bound signals and multi-browser analysis

This doc operationalizes multi-browser / multi-client visibility using data AxTask already stores or emits on purpose, without claiming malware-proof attribution.

## Signals

| Signal | Where | Notes |
|--------|--------|--------|
| **User-Agent hash** | `security_events.user_agent_hash` (SHA-256 of full `User-Agent`) | Distinct hashes usually mean distinct UA strings (different browsers or versions). Browser updates and client-hint / UA reduction can **change** the hash without a new browser. |
| **Client instance id** | Optional header `x-axtask-client-instance` (UUID). Server stores **HMAC-SHA256** in `client_instance_observed` payload only — see [CLIENT_VISIBLE_PRIVACY.md](CLIENT_VISIBLE_PRIVACY.md). | Stable per browser **profile** when `localStorage` works; spoofable — use as a **hint** for analytics and future policy, not as proof. |
| **IP** | `security_events.ip_address` | Useful context; VPNs and mobile networks churn. |

## Volume: prefer login rollup over `api_request`

`api_request` rows are written for **every** authenticated `/api` call. For “how many browser UA strings did this account use?”, prefer **low-volume** event types:

- `auth_login_success`, `auth_totp_login_success`, `oauth_login_success` — each successful sign-in (OAuth paths now emit `oauth_login_success` into `security_events` with UA hash).
- `client_instance_observed` — first authenticated `/api` request in a session that includes a valid `x-axtask-client-instance` header (SPA sends a per-profile UUID from `client/src/lib/client-instance-id.ts` via `apiFetch` / query client).

Retention for `security_events` is **90 days** by default — see [DB_RETENTION_POLICY.md](DB_RETENTION_POLICY.md). Longer analysis needs a scheduled export or rollup table (future work).

## Exploratory SQL

Distinct UA hashes per user (rollup types, last 30 days):

```sql
SELECT actor_user_id,
       COUNT(DISTINCT user_agent_hash) AS distinct_ua
FROM security_events
WHERE actor_user_id IS NOT NULL
  AND user_agent_hash IS NOT NULL
  AND event_type IN (
    'auth_login_success',
    'auth_totp_login_success',
    'oauth_login_success',
    'client_instance_observed'
  )
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY actor_user_id
ORDER BY distinct_ua DESC
LIMIT 50;
```

Heavier (full API traffic):

```sql
SELECT actor_user_id,
       COUNT(DISTINCT user_agent_hash) AS distinct_ua
FROM security_events
WHERE event_type = 'api_request'
  AND actor_user_id IS NOT NULL
  AND user_agent_hash IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY actor_user_id
ORDER BY distinct_ua DESC
LIMIT 50;
```

## Script

From the repo root (requires `DATABASE_URL`):

```bash
node scripts/analyze-browser-signals.mjs
```

Prints top users by distinct UA hash for both `api_request` and login rollup types over 7 and 30 days, plus a 30-day `event_type` volume snapshot.

## Related

- [SESSION_THREAT_MODEL.md](SESSION_THREAT_MODEL.md) — session cookie threat model vs DBSC.
- [CLIENT_VISIBLE_PRIVACY.md](CLIENT_VISIBLE_PRIVACY.md) — client-visible data principles.
