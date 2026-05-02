# AxTask Backup Fortress Plan

**Status:** CLOSED
**Branch:** `feature/backup-fortress-sprints-2026-05-02` → merged to `main`
**Created:** 2026-05-02
**Closed:** 2026-05-02

---

## Sprint 1: Soft Delete (IN PROGRESS)

- Add `deletedAt`, `deletedBy`, `deleteReason`, `purgeAfter`, `restoreCount` to `tasks`.
- Turn `DELETE /api/tasks/:id` into a soft delete.
- Add restore, purge, and trash-list endpoints.
- Update every read path in `storage.ts` and `routes.ts` to exclude `deletedAt IS NOT NULL`.
- Add Trash page in client.
- Write tests.

**Acceptance:** create task → delete → restore → purge after retention works.

---

## Sprint 2: Backup Ledger (NOT STARTED)

- `backup_records`, `restore_records`, hashing, status tracking.
- Import/Export ledger UI.

**Acceptance:** Every export/import creates a durable ledger record.

---

## Sprint 3: JSON Backup v2 (NOT STARTED)

- Expanded backup schema, v1 compatibility, preferences/skills/patterns/reminders export.

**Acceptance:** v1 still imports; v2 backs up more of the account.

---

## Sprint 4: Migration Airlock (NOT STARTED)

- Safe migration commands, backup preflight, schema verification, restore drill, production blocker.

**Acceptance:** Production-like migration refuses to run without backup.

---

## Sprint 5: Immutable Backup Targets (NOT STARTED)

- Backup target abstraction, write-only app token, admin-only restore.

**Acceptance:** App can create backups but cannot erase backup history.
