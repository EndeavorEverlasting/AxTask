# Fix: Calendar task overflow remains reachable

Date: 2026-09-10

Branch: `fix/calendar-task-overflow-20260910`

## Summary

Month and week calendar cells previously rendered only the first three tasks for a date. The task-count badge could indicate additional tasks, but those fourth-and-later tasks were absent from the DOM, so users could not scroll to, click, or drag them.

## Change

- `client/src/components/task-calendar.tsx`: retain the compact day-cell height while rendering every task inside a bounded vertical scroll region.
- Move drag activation to a dedicated task handle so touch swipes over the task body remain available for vertical scrolling while drag-and-drop remains available from the handle.
- Limit the named/focusable overflow region to dates with more than three tasks and derive its announced date from local calendar fields rather than UTC conversion.
- `client/src/components/task-calendar-overflow.test.tsx`: render five tasks and prove the fifth remains present and clickable, verify drag activation is isolated from the scrollable task body, and ensure non-overflowing cells do not add region landmarks.

## Scope

- Task Calendar month/week day-cell overflow and access behavior only.
- Day view task rendering is unchanged.
- No task persistence/API/auth/schema, scheduling semantics, database, deployment configuration, or broad calendar redesign changes.

## Validation

- `npm run check`
- `npm test` — includes `client/src/components/task-calendar-overflow.test.tsx`.
- `npm run release:check`
- Standard PR CI, including production build and repository browser regression gates.

## Rollback

Revert the calendar overflow implementation, focused regression test, and this release record. No data, schema, or deployment rollback is required.
