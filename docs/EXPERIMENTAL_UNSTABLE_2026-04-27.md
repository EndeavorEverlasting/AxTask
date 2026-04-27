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

## Related planning

- AI + location reminders merge checklist: `branches and new features/AxTask_integration_checklist_ai_location_reminders.md` (references `feature/ai-location-reminders-foundation`; this experimental branch carries that work merged forward).
