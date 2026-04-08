# Offline Phase C: task mutation queue + conflicts

Phase C adds **offline-first task writes**: creates, updates, deletes, manual reorder, and a **generic queue** for selected other `POST`/`PUT`/`DELETE` routes. The client persists a **FIFO queue** in `localStorage` (`OFFLINE_TASK_QUEUE_STORAGE_KEY` in `client/src/lib/offline-task-queue.ts`).

## Server: optimistic concurrency

- **`PUT /api/tasks/:id`** accepts optional **`baseUpdatedAt`** (ISO string of the last known server `updatedAt`). If it does not match the row in PostgreSQL (within 1 ms), the server responds with **`409`** and payload **`{ code: "task_conflict", serverTask, message }`** (`shared/offline-sync.ts`).
- **`forceOverwrite: true`** in the JSON body skips the check after the user explicitly chooses “keep my changes” in the conflict dialog.
- **`DELETE /api/tasks/:id`** supports optional query **`baseUpdatedAt`** for the same check; **`overwrite=1`** skips the check (after user confirmation).
- **`POST /api/tasks`** accepts an optional client **`id`** (UUID) so offline creates can replay with a stable primary key (must not already exist).

## Client

- **`task-sync-api.ts`** — `syncCreateTask`, `syncUpdateTask`, `syncDeleteTask`, `syncReorderTasks`, `syncRawTaskRequest`; uses **`apiFetch`** where **`409`** must be handled (`client/src/lib/queryClient.ts`).
- **`TaskOfflineSyncProvider`** — drains the queue when online and whenever the queue changes; mounts **`TaskConflictDialog`**.
- **Logout** clears the queue (`clearOfflineTaskQueue` in `auth-context.tsx`) so the next account cannot apply another user’s pending ops.
- **Banner** — `OfflineDataBanner` shows queued mutation count when online.

## Conflict policy (tasks)

Aligned with Phase A docs: **server wins at merge time** unless the user explicitly **forces** their edit after seeing the conflict. **“Review both”** refreshes the task list from the server so the user can re-open the task and reconcile manually.

## Limitations

- Large **bulk import** is not queued offline (requires network).
- **`POST /api/tasks/review`** (voice / planner AI) still needs the server; no offline queue.
- Queued **`http`** ops replay in order; they do not participate in task-specific conflict UI beyond normal API errors.

## Related

- [OFFLINE_PHASE_A.md](./OFFLINE_PHASE_A.md) — read cache + stale/offline UI.
- [OFFLINE_PHASE_B.md](./OFFLINE_PHASE_B.md) — device refresh session.
- [OFFLINE_PHASE_D.md](./OFFLINE_PHASE_D.md) — safe per-user query persistence.
