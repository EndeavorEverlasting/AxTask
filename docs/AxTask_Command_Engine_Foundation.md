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
  map-to-dispatcher.ts
  index.ts

scripts/
  intent-smoke.mts

docs/
  AxTask_Command_Engine_Foundation.md
```

## Recommended repo placement

Files live in the AxTask repo under `shared/intent/`, `scripts/`, and `docs/` as above.

## Run the smoke script (uses the real TypeScript parser)

```json
"intent:smoke": "tsx scripts/intent-smoke.mts"
```

```bash
npm run intent:smoke
```

## Typed command palette (client)

**Ctrl+Shift+K** / **Cmd+Shift+K** opens the command palette. It calls `parseNaturalCommand` locally for preview, then **Run** POSTs the line to `/api/voice/process` (same as voice).

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

Target: `server/engines/dispatcher.ts`.

- **Calendar first:** if `classifyCalendarIntent` is not `unknown`, `processCalendarCommand` runs and returns (parser does not override).
- **Task review breadth:** `isTaskReviewIntent` still forces the review engine for utterances that match its patterns.
- Otherwise: `parseNaturalCommand(transcript, { now, todayStr })` plus `mapParsedCommandToIntent`, with fallback to legacy `classifyIntent` when the parser returns `unknown`.
- **Shopping** utterances are still handled inside the `task_create` branch as before.

### Phase 4: reminder table

`task_reminders` is defined in `shared/schema/tasks.ts` with migration `migrations/0036_task_reminders.sql`. The alarm companion can evolve into a delivery worker; application routes that create rows can follow in a later PR.

## Design rules

### 1. Parse first. Execute later.

Never let voice directly mutate the database.

### 2. Every intent gets confidence

### 3. Relative dates must resolve using an injected clock

```ts
parseNaturalCommand(input, {
  now: new Date(),
  todayStr: "2026-04-25",
})
```

### 4. Support typed commands before voice

Typed command bar first. Voice later.

## Test phrases

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

## Vitest

```bash
npx vitest run shared/intent/parse-natural-command.test.ts
```

## Cold judge assessment

The repo already has strong organs.

What it needs now is a nervous system.

Build the parser, route every input through it, and stop letting features grow sideways like vines through abandoned concrete.
