# 2026-09-06 — Spreadsheet import postcondition

## Purpose

Close the false-green acceptance gap in spreadsheet task import without committing private task contents or changing production recovery gates.

## Behavior

`apiRequest` now applies a narrow postcondition to `POST /api/tasks/import`:

- a response that reports failed rows is surfaced as an import error instead of a green completion;
- a clean insert needs no extra list read because the server has already returned from the database insert path;
- when the server skips one or more rows as duplicate fingerprints, the client performs one authenticated `GET /api/tasks` and verifies that every requested logical task is actually present;
- logical presence uses the collision-safe normalized date/time/activity/notes identity introduced by the operator-preflight sprint;
- if any logical task is missing after duplicate handling, the request rejects and the existing Import/Export page cannot reach its green `Import Complete` state.

This specifically prevents a stale fingerprint record from being treated as proof that the corresponding task still exists.

## Performance boundary

The extra task-list read occurs only when the import response reports at least one duplicate skip. Ordinary clean imports do not add a verification request.

## Privacy and production boundary

The verifier operates on the authenticated user's normal `/api/tasks` response and the tasks already selected in the browser. It does not persist private import contents anywhere new, does not bypass authentication, and does not mutate Render or Neon configuration.

Repository/CI proof establishes request-level false-green prevention. Actual production deployment, Google login, restart persistence, and the real operator-account import remain runtime gates governed by `docs/DB_RECOVERY_RUNBOOK.md`.
