# AxTask Command Engine Foundation

## Purpose

This pack gives AxTask a clean foundation for typed commands, voice commands, alarms, reminders, and recurring scheduling.

The goal is simple:

```txt
User phrase
  -> deterministic parser
  -> structured intent
  -> confirmation card
  -> task/reminder/schedule execution
```

This keeps AxTask from becoming a swamp of one-off regexes.

## Current repo reality

AxTask already has useful pieces:

- A server-side voice dispatcher with intent types for task creation, planner queries, calendar commands, navigation, search, task review, and alarm configuration.
- Notification preferences, push subscriptions, quiet hours, and intensity controls.
- An alarm companion service for native notifications.
- Task fields for date, time, recurrence, start/end date, duration, and dependencies.

The missing layer is a shared command parser that both typed commands and voice transcripts can use.

## Files in this pack

```txt
shared/intent/
  intent-types.ts
  time-parser.ts
  recurrence-parser.ts
  parse-natural-command.ts
  index.ts

scripts/
  intent-smoke.mjs

docs/
  AxTask_Command_Engine_Foundation.md
```

## Recommended repo placement

Copy these files into the AxTask repo:

```bash
cp -R shared/intent ./shared/
cp scripts/intent-smoke.mjs ./scripts/
cp docs/AxTask_Command_Engine_Foundation.md ./docs/
```

Then create a branch:

```bash
git checkout main
git pull
git checkout -b feature/2026-04-25-axtask-command-engine-foundation
```

## Add this package script

In `package.json`, add:

```json
"intent:smoke": "node scripts/intent-smoke.mjs"
```

Then run:

```bash
npm run intent:smoke
```

## Implementation sequence

### Phase 1: pure parser, no UI

Build and test the parser against phrases like:

```txt
remind me to check my oil tomorrow at 7pm
laundry every Saturday morning
groceries every now and again
plan my report for Josh on April billing hours
show my alarms
```

Expected output:

```ts
{
  kind: "create_reminder",
  activity: "check my oil",
  date: "2026-04-26",
  time: "19:00",
  confidence: 0.82,
  needsConfirmation: true
}
```

### Phase 2: confirmation panel

Do not auto-create from voice.

Voice is messy. It lies with confidence.

Use this sequence:

```txt
Transcript
  -> parseNaturalCommand()
  -> CommandReviewCard
  -> user confirms
  -> execute command
```

### Phase 3: integrate with current dispatcher

Current likely target:

```txt
server/engines/dispatcher.ts
```

Instead of growing the dispatcher regex pile forever, let the dispatcher call:

```ts
parseNaturalCommand(transcript, { now, todayStr })
```

Then map structured intents to current actions:

```ts
create_task          -> prefill_task
create_reminder      -> alarm_create_for_task OR reminder_create
create_recurring_task -> prefill_task with recurrence
planning_request     -> planner_query
navigation           -> navigate
search               -> show_results
alarm_list           -> alarm_list
```

### Phase 4: reminder table

The alarm companion currently persists pending local timers under its own data path. That works for MVP but should not be the long-term memory layer.

Add DB-backed reminders later:

```sql
CREATE TABLE task_reminders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id varchar REFERENCES tasks(id) ON DELETE SET NULL,
  activity text NOT NULL,
  remind_at timestamp NOT NULL,
  recurrence_rule text,
  delivery_channel text NOT NULL DEFAULT 'auto',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
```

Then the companion becomes a delivery worker, not the system of record.

## Design rules

### 1. Parse first. Execute later.

Never let voice directly mutate the database.

Bad:

```txt
"AxTask, delete all my tasks"
  -> deletes tasks
```

Good:

```txt
Intent detected: destructive action
  -> confirmation required
```

### 2. Every intent gets confidence

Example:

```ts
confidence: 0.72
needsConfirmation: true
```

Use thresholds:

| Confidence | Behavior |
|---:|---|
| 0.90+ | show compact confirmation |
| 0.70-0.89 | show full confirmation |
| < 0.70 | ask clarifying question |

### 3. Relative dates must resolve using an injected clock

Do not call `new Date()` everywhere.

Pass:

```ts
parseNaturalCommand(input, {
  now: new Date(),
  todayStr: "2026-04-25",
})
```

This makes tests deterministic.

### 4. Support typed commands before voice

Typed command bar first. Voice later.

Voice is just a noisy keyboard with a microphone costume.

## Test phrases

Use these as the first regression suite:

```txt
remind me to check oil tomorrow at 7pm
remind me about groceries at 9
laundry every Saturday morning
do laundry every week
help me plan my report for Josh on April billing hours
show my alarms
open calendar
find billing tasks
mark laundry done
```

## Product direction

The eventual polished interface should include:

- Global command bar
- Mic button
- Confirmation cards
- Reminder preview
- Recurrence preview
- Safety prompts for destructive actions
- Accessible keyboard-only interaction
- Screen-reader-friendly command review

## Cold judge assessment

The repo already has strong organs.

What it needs now is a nervous system.

Build the parser, route every input through it, and stop letting features grow sideways like vines through abandoned concrete.
