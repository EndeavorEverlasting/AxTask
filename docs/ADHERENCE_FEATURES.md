# User Adherence Features

AxTask can detect and nudge users when adherence drops, using user-only interventions (in-app + push).

## Feature flag

- `ADHERENCE_INTERVENTIONS_ENABLED=true` enables evaluator, scheduler, and dispatch pipeline.

## Signals (v1)

- `missed_due_dates`: open tasks overdue by threshold.
- `reminder_ignored`: reminder/intervention was sent and no task mutation happened in the follow-up window.
- `streak_drop`: streak has dropped and completion momentum is stale.
- `no_engagement`: no login/task activity for threshold days.

## Runtime thresholds (optional env vars)

- `ADHERENCE_MISSED_DUE_MINUTES` (default `60`)
- `ADHERENCE_REMINDER_IGNORED_MINUTES` (default `120`)
- `ADHERENCE_STREAK_DROP_DAYS` (default `1`)
- `ADHERENCE_NO_ENGAGEMENT_DAYS` (default `3`)
- `ADHERENCE_SIGNAL_COOLDOWN_HOURS` (default `12`)
- `ADHERENCE_STALE_EVAL_MINUTES` (default `30`)
- `ADHERENCE_CRON_INTERVAL_MS` (default `300000`)

## Push delivery env vars

- `VAPID_PUBLIC_KEY` (or `VITE_VAPID_PUBLIC_KEY`)
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (optional, default `mailto:alerts@axtask.app`)

Full provisioning and troubleshooting guide: [NOTIFICATIONS_AND_PUSH.md](NOTIFICATIONS_AND_PUSH.md).

## API endpoints

- `GET /api/adherence/interventions?limit=10`
  - Returns open adherence interventions for the authenticated user.
- `POST /api/adherence/interventions/:id/acknowledge`
  - Body: `{ "action": "acknowledge" }` or `{ "action": "dismiss" }`.
- `POST /api/adherence/refresh`
  - Triggers a manual adherence evaluation for the current user.

## PowerShell quick checks

```powershell
$BaseUrl = "http://localhost:5000"
$Cookie = Get-Content .\user-cookie.txt -Raw

Invoke-RestMethod "$BaseUrl/api/adherence/refresh" -Method POST -Headers @{ Cookie = $Cookie }
Invoke-RestMethod "$BaseUrl/api/adherence/interventions?limit=10" -Headers @{ Cookie = $Cookie }
```

## SQL troubleshooting

```sql
SELECT user_id, signal, status, created_at, push_sent_at, acknowledged_at, dismissed_at
FROM user_adherence_interventions
ORDER BY created_at DESC
LIMIT 100;
```

```sql
SELECT *
FROM user_adherence_state
ORDER BY updated_at DESC
LIMIT 100;
```

