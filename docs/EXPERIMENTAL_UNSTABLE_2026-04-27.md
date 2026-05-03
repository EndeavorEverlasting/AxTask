# Experimental unstable line — 2026-04-27

This branch is the **daytime integration lane** for work that must be **stable by end of day** while `main` stays the **morning-stable** integration point.

## Branch

- **Remote:** `experimental/unstable-2026-04-27`
- **Base:** `origin/main` at merge time (includes post-merge hygiene after checkpoint **2026-04-27**).
- **Folded in:** `origin/feature/ai-location-reminders-foundation` (location/reminder storage barrel, mocked storage tests, migration verify table list, planner contract + routes snapshot updates tied to that work).

## How to continue from another clone

```bash
git fetch origin
git checkout experimental/unstable-2026-04-27
```

## Stability intent

- **Start of day:** treat `main` as stable.
- **During day:** land risky or cross-cutting changes here first; run `npm run check` and `npm run test` before push.
- **End of day:** promote to `main` via PR only after the production-branch rules in `docs/GIT_BRANCHING_AND_DEPLOYMENT.md` / `AGENTS.md`.

## Branch discipline (no parallel “fresh from main” lane)

- **Do all forward work on this branch** or on **short-lived children cut from it** (e.g. `feature/unstable-parser-port`), then merge back here and push.
- **Deploy and test this branch** before opening a promotion PR to `main`.
- Do **not** abandon this line and start a new synthesis branch from `main` while unstable still carries the integration (see `branches and new features/AxTask_plan_including_unstable_branch.md`).

## API surface: route relocation, not deprecation

Location and reminder HTTP handlers were **moved** from the `server/routes.ts` monolith into registrars for modularity. **Paths and behavior are unchanged:**

- `GET` / `POST` `/api/location-places`, `POST` `/api/location-events` — `server/routes/locations.ts`
- `GET` / `POST` `/api/reminders`, `PATCH` / `DELETE` `/api/reminders/:id` — `server/routes/reminders.ts`

`server/routes.ts` still calls `registerLocationRoutes` / `registerReminderRoutes` / `registerAiRoutes` so the app exposes the same routes as before the extraction.

## Related planning

- AI + location reminders merge checklist: `branches and new features/AxTask_integration_checklist_ai_location_reminders.md` (references `feature/ai-location-reminders-foundation`; this experimental branch carries that work merged forward).
- **Reminder architecture:** [docs/REMINDER_MODEL_RECONCILIATION.md](REMINDER_MODEL_RECONCILIATION.md) — how `user_reminders` + triggers (ops) coexist with `task_reminders` (tasks domain).

## Ports landed on this line (integration chassis)

- **`shared/intent/`** — parser foundation (`parse-natural-command`, time/recurrence parsers, map-to-dispatcher) from `feature/2026-04-25-command-parser-tests`, plus `scripts/intent-smoke.mts` for manual smoke.
- **Command palette + hotkey** — `client/src/components/command-palette.tsx`, `Ctrl/Cmd+Shift+K`, wired in `App.tsx`; **`submitTextCommand`** on `VoiceProvider` routes typed commands through the same pipeline as finalized voice (`handleVoiceResult` → `POST /api/voice/process`).
- **Dispatcher** — updates from `feature/2026-04-25-command-ui-dispatcher` merged into `server/engines/dispatcher.ts` (with tests).
- **`task_reminders`** — migration `0036_task_reminders.sql` + Drizzle `taskReminders` in `shared/schema/tasks.ts`; see reconciliation doc above.
