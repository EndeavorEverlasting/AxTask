# 2026-09-06 — Spreadsheet import postcondition

## Purpose

Close the false-green acceptance gap in spreadsheet task import without committing private task contents or changing production recovery gates.

## Behavior

`apiRequest` now applies a narrow postcondition to `POST /api/tasks/import`:

- all four response counts (`imported`, `failed`, `skippedAsDuplicate`, `total`) must be non-negative safe integers and must reconcile exactly with the submitted row count;
- a response that reports failed rows is surfaced as an import error instead of a green completion;
- a clean insert needs no extra verification request because the server has already returned from the database insert path;
- when the server skips one or more rows as duplicate fingerprints, the client calls authenticated `POST /api/account/task-import-presence` with that import chunk;
- the presence endpoint checks `storage.getTasks(userId)`, which is owner-only and excludes deleted tasks, so collaborator-shared lookalikes cannot satisfy the import postcondition;
- the endpoint returns only logical presence counts, not the user's full task list;
- logical presence uses the collision-safe normalized date/time/activity/notes identity introduced by the operator-preflight sprint;
- if any logical task is missing after duplicate handling, the request rejects and the existing Import/Export page cannot reach its green `Import Complete` state;
- every failed import-request path invalidates task and task-stat caches because the server may have committed a valid subset before the error surfaced.

This specifically prevents a stale fingerprint record, malformed import summary, or matching shared task from being treated as proof that the requested owned task still exists.

## Performance boundary

The compact presence request occurs only when the import response reports at least one duplicate skip. It returns counts only. After success, the Import/Export page keeps its existing cache invalidation, so duplicate handling does not add a second full `/api/tasks` network read. The presence endpoint accepts at most 2,000 rows, matching the browser import chunk size.

## Privacy and production boundary

The verifier operates on the tasks already selected in the browser and the authenticated user's owned task rows on the server. It does not persist private import contents anywhere new, return task contents from the verification endpoint, bypass authentication, or mutate Render or Neon configuration.

Repository/CI proof establishes request-level false-green prevention. Actual production deployment, Google login, restart persistence, and the real operator-account import remain runtime gates governed by `docs/DB_RECOVERY_RUNBOOK.md`.
