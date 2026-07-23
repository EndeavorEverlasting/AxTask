# Task Notes Editor Ergonomics

**Date:** 2026-07-23  
**Source:** exact unique work preserved from stale draft PR #84

## User impact

- Task notes accept up to 50,000 characters through the shared application and database contracts.
- The create/edit form prioritizes the writing surface rather than repeating a second Markdown preview.
- The notes editor has a 240px minimum height, remains user-resizable, and displays the shared character budget.
- Pasted and attached image feedback returns focus to the notes editor.

## Preservation proof

Both implementation files were byte-identical between PR #84's original base and current `main`, so the four reviewed source blobs were transplanted without overwriting newer work.

## Database contract

`migrations/0043_task_notes_50000_limit.sql` adds and validates `tasks_notes_max_50000`. The previous application contract limited normal writes to 10,000 characters, so application-created existing rows should already satisfy the expanded cap. Migration validation fails rather than silently accepting oversized historical rows.

## Validation

Focused notes ergonomics and shared-schema tests, typecheck, full test suite, release contract, build, browser regression, and disposable PostgreSQL migration/idempotency verification.

## Rollback

Revert the application and test files, then drop `tasks_notes_max_50000` only if the 50,000-character contract itself is being withdrawn. Existing notes do not require transformation.

## Proof ceiling

Repository tests and disposable-database proof do not prove production deployment, browser behavior on every device, or live production data compatibility until the migration is applied in an authorized deployment.
