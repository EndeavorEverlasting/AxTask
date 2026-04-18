# Monitoring (API request params + error tracing)

AxTask persists privacy-safe request telemetry to the tamper-evident `security_events` ledger and exposes it via admin endpoints.

## What gets recorded

- `eventType: "api_request"` on every `/api` request (includes `durationMs` and an allowlisted/redacted parameter snapshot).
- `eventType: "api_error"` when:
  - a request throws into the global error handler, or
  - a handler returns a 5xx response without throwing (fallback).

Both include a `requestId` (propagated as `x-request-id`).

## Environment variables (optional)

- **`ADMIN_ALERT_EMAILS`**: Comma-separated recipients. If unset, the notifier falls back to DB users where `users.role = 'admin'`.
- **`ADMIN_ALERT_WEBHOOK_URL`**: Webhook URL (Slack/Discord-compatible `{ "text": "..." }`).
- **`ADMIN_ALERT_MODE`**: `production` (default), `always`, or `off`.
- **`ADMIN_ALERT_DEDUPE_TTL_MS`**: Dedupe window per distinct error (default 60000).
- **`RESEND_API_KEY` / `RESEND_FROM`**: Required for email delivery (Resend).

## Live monitoring via Admin API (PowerShell)

These calls require an authenticated admin session (and step-up in production).

### Poll newest errors (every 5 seconds)

```powershell
$BaseUrl = "http://localhost:5000"
$Cookie = Get-Content .\admin-cookie.txt -Raw   # optional: your saved cookie header

while ($true) {
  try {
    $r = Invoke-RestMethod "$BaseUrl/api/admin/security-events?limit=200" -Headers @{ Cookie = $Cookie }
    $r |
      Where-Object { $_.eventType -eq "api_error" } |
      Select-Object -First 10 id createdAt statusCode route method payloadJson
  } catch {
    $_.Exception.Message
  }
  Start-Sleep -Seconds 5
}
```

### Filter the JSON payload in PowerShell

```powershell
$events = Invoke-RestMethod "$BaseUrl/api/admin/security-events?limit=500" -Headers @{ Cookie = $Cookie }

$events |
  Where-Object { $_.eventType -eq "api_error" } |
  ForEach-Object {
    $p = $_.payloadJson | ConvertFrom-Json
    [pscustomobject]@{
      createdAt  = $_.createdAt
      statusCode = $_.statusCode
      route      = "$($_.method) $($_.route)"
      requestId  = $p.requestId
      taskId     = $p.params.taskId
      message    = "$($p.errorName): $($p.errorMessage)"
    }
  } |
  Select-Object -First 20
```

## Query in Postgres (psql)

`security_events.payload_json` is stored as text; cast it to jsonb for filtering.

### Latest API errors

```sql
SELECT
  created_at,
  status_code,
  method,
  route,
  (payload_json::jsonb)->>'requestId' AS request_id,
  (payload_json::jsonb)->>'errorName' AS error_name,
  (payload_json::jsonb)->>'errorMessage' AS error_message
FROM security_events
WHERE event_type = 'api_error'
ORDER BY created_at DESC
LIMIT 50;
```

### Filter by `requestId`

```sql
SELECT *
FROM security_events
WHERE (payload_json::jsonb)->>'requestId' = 'YOUR_REQUEST_ID'
ORDER BY created_at DESC;
```

### Filter by an allowlisted parameter (example: `taskId`)

```sql
SELECT
  created_at,
  status_code,
  method,
  route,
  (payload_json::jsonb)->'params'->>'taskId' AS task_id,
  (payload_json::jsonb)->>'errorMessage' AS error_message
FROM security_events
WHERE event_type = 'api_error'
  AND (payload_json::jsonb)->'params'->>'taskId' = 'abc123'
ORDER BY created_at DESC
LIMIT 50;
```

## Burst / anomaly analysis (Admin API)

AxTask includes a simple analyzer that creates `security_alerts` (e.g., route failure bursts).

```bash
curl -X POST -b "axtask.sid=..." http://localhost:5000/api/admin/security-alerts/analyze
curl -b "axtask.sid=..." http://localhost:5000/api/admin/security-alerts?limit=200
```

## User adherence monitoring (new)

Adherence interventions are user-facing (in-app + push), with events persisted in:

- `user_adherence_interventions`
- `user_adherence_state`

See [docs/ADHERENCE_FEATURES.md](docs/ADHERENCE_FEATURES.md) for runtime flags and APIs.

