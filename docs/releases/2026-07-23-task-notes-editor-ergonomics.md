# Task Notes Editor Ergonomics

**Date:** 2026-07-23  
**Source:** exact unique work preserved from stale draft PR #84

## User impact

- Task notes accept up to 50,000 characters through the shared schema contract.
- The create/edit form prioritizes the writing surface rather than repeating a second Markdown preview.
- The notes editor has a 240px minimum height, remains user-resizable, and displays the shared character budget.
- Pasted and attached image feedback returns focus to the notes editor.

## Preservation proof

Both implementation files were byte-identical between PR #84's original base and current `main`, so the four reviewed source blobs were transplanted without overwriting newer work.

## Validation

Focused notes ergonomics and shared-schema tests, typecheck, full test suite, release contract, build, browser regression, and standard CI.

## Rollback

Revert the four implementation/test files and this release record. No database or data migration rollback is required.

## Proof ceiling

Repository tests and build proof do not prove production deployment, browser behavior on every device, or the preservation of notes longer than the server/database storage contract allows.
