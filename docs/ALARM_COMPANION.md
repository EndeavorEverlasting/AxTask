# Alarm Companion (Host Service)

AxTask Docker can route alarm apply requests to a host-local companion service for cross-OS behavior.

## Start

```bash
npm run alarm:companion:start
```

Default bind: `127.0.0.1:8787`

## Configure Docker app

Set in `.env.docker`:

```bash
AXTASK_ALARM_COMPANION_URL=http://host.docker.internal:8787/apply-alarm
```

Optional shared secret (recommended): set the same value in `.env.docker` and in the shell where you start the companion:

```bash
AXTASK_ALARM_COMPANION_SECRET=your-long-random-string
```

The AxTask server sends `Authorization: Bearer <secret>` when forwarding to the companion.

## CORS (browser-only callers)

If you call the companion directly from a browser origin, set an allowlist:

```bash
AXTASK_ALARM_COMPANION_ALLOW_ORIGINS=http://localhost:5000,http://127.0.0.1:5000
```

Server-to-server fetches from AxTask do not need CORS.

## Endpoints

- `GET /health` -> readiness and pending alarm timer count.
- `POST /apply-alarm` -> schedules an alarm payload.

Request body:

```json
{
  "payloadJson": "{\"taskActivity\":\"Doctor appointment\",\"alarmAtIso\":\"2026-04-24T14:30:00.000Z\"}"
}
```

## Runtime mode

Current MVP mode uses an in-process timer that triggers a native notification best-effort:

- Windows: PowerShell message box
- macOS: `osascript` notification
- Linux: `notify-send` if available

If the native notifier is unavailable, the request still returns success for timer scheduling, and AxTask UI fallback remains available.

## Persistence

Pending alarms are written under `tools/alarm-companion/data/pending-alarms.json` (gitignored). On companion restart, timers are restored from that file so short-lived schedules survive process restarts.
