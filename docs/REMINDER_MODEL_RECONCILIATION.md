# Reminder model reconciliation (ops triggers vs durable task rows)

AxTask carries **two complementary persistence shapes**. Neither replaces the other; they address different surfaces.

## 1. Operational reminders (`shared/schema/ops.ts`)

- **`user_reminders`** — definition: title, body, kind, enabled, `createdBy` (user / AI / system).
- **`user_reminder_triggers`** — one or more triggers per reminder: `triggerType`, `payloadJson`, `nextRunAt`, cooldown, etc.
- Supports **location arrival/departure/offset**, recurring rules in payload, and future scheduler work.

This is the **head** for natural-language and location-aware flows (`server/routes/reminders.ts`, offset scheduling in `server/storage/reminders.ts`).

## 2. Durable task-linked reminders (`shared/schema/tasks.ts`)

- **`task_reminders`** — rows keyed by user, optional `task_id`, `remind_at`, optional `recurrence_rule`, `delivery_channel`, `status`.
- Migration: [`migrations/0036_task_reminders.sql`](../migrations/0036_task_reminders.sql).

This is the **native / companion delivery** lane (alarm companion, task-tied “remind me at 3pm about this task”, etc.).

## 3. Design rule (no time-only collapse)

Do **not** fold location-offset or multi-trigger semantics into a single `remind_at` column on `task_reminders`. Keep **triggers separate** on `user_reminder_triggers` for expressive scheduling.

Use **`task_reminders`** when the product path is “persist a concrete fire time (or simple recurrence) for a worker to poll.”

Use **`user_reminders` + `user_reminder_triggers`** when the product path is “assistant / user authored reminder with one or more trigger kinds including location.”

## 4. Current branch policy (LLM writes)

- `datetime` and `recurring_time` intents persist to **`task_reminders`**.
- `location_arrival`, `location_departure`, and `location_arrival_offset` persist to **`user_reminders` + `user_reminder_triggers`**.
- **No dual-write for now.** We keep one source per write path to avoid accidental divergence while the bridge contract is still evolving.

## 5. Unification direction

- One **user-facing** reminder story should eventually **read** from both stores where appropriate (e.g. planner summary), keyed by source.
- **Writes** stay typed: NL + location → ops tables; companion-native task alarms → `task_reminders` until a deliberate bridge exists.
- Planned unified read route: `GET /api/reminders/summary` returning both stores with `source: "task_reminder" | "ops_reminder"`.

## 6. Optional future bridge metadata (only if dual-write lands)

If we later choose dual-write, add provenance fields before enabling it:

- `source_type`
- `source_reminder_id`
- `source_trigger_id`
- `idempotency_key`

Update this doc when a sync job or API aggregates both into a single DTO for clients.
