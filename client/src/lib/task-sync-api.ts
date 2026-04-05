import type { QueryClient } from "@tanstack/react-query";
import type { InsertTask, Task } from "@shared/schema";
import { isTaskConflictPayload } from "@shared/offline-sync";
import { apiFetch, apiRequest } from "./queryClient";
import {
  enqueueHttpMutation,
  enqueueTaskCreate,
  enqueueTaskDelete,
  enqueueTaskReorder,
  enqueueTaskUpdate,
  peekOfflineQueue,
  removeOfflineOp,
  type OfflineTaskOp,
} from "./offline-task-queue";
import { openConflictDialog, type ConflictChoice } from "./task-conflict-deferred";

/** User chose server / review during conflict — caller should not toast success. */
export class TaskSyncAbortedError extends Error {
  override name = "TaskSyncAbortedError";
  constructor(message = "Sync aborted") {
    super(message);
  }
}

export function isBrowserOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

export function taskUpdatedAtIso(task: Task | undefined): string | null {
  if (!task?.updatedAt) return null;
  const d = task.updatedAt;
  return typeof d === "string" ? d : new Date(d).toISOString();
}

export function optimisticTaskFromInsert(data: InsertTask, id: string, userId: string): Task {
  const now = new Date().toISOString();
  return {
    id,
    userId,
    date: data.date,
    time: data.time ?? null,
    activity: data.activity,
    notes: data.notes ?? "",
    urgency: data.urgency ?? null,
    impact: data.impact ?? null,
    effort: data.effort ?? null,
    prerequisites: data.prerequisites ?? "",
    recurrence: data.recurrence ?? "none",
    priority: "Low",
    priorityScore: 0,
    classification: "General",
    status: data.status ?? "pending",
    isRepeated: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  } as unknown as Task;
}

export function mergeTaskInCache(queryClient: QueryClient, taskId: string, patch: Record<string, unknown>): void {
  queryClient.setQueryData<Task[]>(["/api/tasks"], (old) => {
    if (!old) return old;
    return old.map((t) => (t.id === taskId ? ({ ...t, ...patch } as Task) : t));
  });
}

export function removeTaskFromCache(queryClient: QueryClient, taskId: string): void {
  queryClient.setQueryData<Task[]>(["/api/tasks"], (old) => old?.filter((t) => t.id !== taskId) ?? []);
}

export function appendTaskToCache(queryClient: QueryClient, task: Task): void {
  queryClient.setQueryData<Task[]>(["/api/tasks"], (old) => [...(old ?? []), task]);
}

async function resolveUpdateConflict(
  taskId: string,
  patch: Record<string, unknown>,
  serverTask: Task,
  baseUpdatedAt: string | null,
  queryClient: QueryClient,
): Promise<Response> {
  const choice: ConflictChoice = await openConflictDialog({
    kind: "update",
    taskId,
    serverTask,
    localPatch: patch,
    baseUpdatedAt,
  });
  if (choice === "server") {
    await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
    return new Response(null, { status: 499 });
  }
  if (choice === "both") {
    await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    return new Response(null, { status: 499 });
  }
  const retry = await apiFetch("PUT", `/api/tasks/${taskId}`, {
    ...patch,
    id: taskId,
    forceOverwrite: true,
  } as Record<string, unknown>);
  if (!retry.ok) {
    const t = await retry.text();
    throw new Error(t || retry.statusText);
  }
  return retry;
}

export async function syncCreateTask(
  data: InsertTask,
  queryClient: QueryClient,
  userId: string,
): Promise<unknown> {
  if (!isBrowserOnline()) {
    const clientId = crypto.randomUUID();
    enqueueTaskCreate(clientId, data);
    const optimistic = optimisticTaskFromInsert(data, clientId, userId);
    appendTaskToCache(queryClient, optimistic);
    return { ...optimistic, offlineQueued: true };
  }
  const { id: _drop, ...rest } = data as InsertTask & { id?: string };
  const res = await apiFetch("POST", "/api/tasks", rest);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json();
}

export async function syncUpdateTask(
  taskId: string,
  patch: Record<string, unknown>,
  baseTask: Task | undefined,
  queryClient: QueryClient,
): Promise<unknown> {
  const baseUpdatedAt = taskUpdatedAtIso(baseTask);
  const shallowIn: Record<string, unknown> = { ...patch };
  delete shallowIn.id;
  delete shallowIn.baseUpdatedAt;
  delete shallowIn.forceOverwrite;
  const body: Record<string, unknown> = { id: taskId, ...shallowIn };
  if (baseUpdatedAt) body.baseUpdatedAt = baseUpdatedAt;

  if (!isBrowserOnline()) {
    const shallow: Record<string, unknown> = { ...shallowIn };
    enqueueTaskUpdate(taskId, shallow, baseUpdatedAt);
    mergeTaskInCache(queryClient, taskId, shallow);
    return { offlineQueued: true };
  }

  let res = await apiFetch("PUT", `/api/tasks/${taskId}`, body);
  if (res.status === 409) {
    const j = await res.json();
    if (isTaskConflictPayload(j)) {
      res = await resolveUpdateConflict(
        taskId,
        { ...shallowIn },
        j.serverTask as Task,
        baseUpdatedAt,
        queryClient,
      );
    }
  }
  if (res.status === 499) {
    throw new TaskSyncAbortedError("Discarded in favor of server data.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json();
}

export async function syncDeleteTask(
  taskId: string,
  baseTask: Task | undefined,
  queryClient: QueryClient,
): Promise<void> {
  const baseUpdatedAt = taskUpdatedAtIso(baseTask);
  const qs =
    baseUpdatedAt !== null && baseUpdatedAt !== undefined
      ? `?baseUpdatedAt=${encodeURIComponent(baseUpdatedAt)}`
      : "";

  if (!isBrowserOnline()) {
    enqueueTaskDelete(taskId, baseUpdatedAt);
    removeTaskFromCache(queryClient, taskId);
    return;
  }

  let res = await apiFetch("DELETE", `/api/tasks/${taskId}${qs}`);
  if (res.status === 409) {
    const j = await res.json();
    if (isTaskConflictPayload(j)) {
      const choice = await openConflictDialog({
        kind: "delete",
        taskId,
        serverTask: j.serverTask as Task,
        baseUpdatedAt,
      });
      if (choice === "server" || choice === "both") {
        await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        throw new TaskSyncAbortedError("Delete cancelled — server version kept.");
      }
      const delQs =
        baseUpdatedAt !== null && baseUpdatedAt !== undefined
          ? `?overwrite=1&baseUpdatedAt=${encodeURIComponent(baseUpdatedAt)}`
          : "?overwrite=1";
      res = await apiFetch("DELETE", `/api/tasks/${taskId}${delQs}`);
    }
  }
  if (!res.ok && res.status !== 204) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
}

export async function syncReorderTasks(taskIds: string[], queryClient: QueryClient): Promise<void> {
  if (!isBrowserOnline()) {
    enqueueTaskReorder(taskIds);
    queryClient.setQueryData<Task[]>(["/api/tasks"], (old) => {
      if (!old) return old;
      const map = new Map(old.map((t) => [t.id, t]));
      return taskIds.map((id) => map.get(id)).filter(Boolean) as Task[];
    });
    return;
  }
  const res = await apiRequest("PATCH", "/api/tasks/reorder", { taskIds });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
}

export async function syncRawTaskRequest(
  method: string,
  path: string,
  body: unknown,
  queryClient: QueryClient,
): Promise<unknown> {
  if (!isBrowserOnline()) {
    enqueueHttpMutation(method, path, body);
    return { offlineQueued: true };
  }
  const res = await apiRequest(method, path, body);
  if (res.status === 204) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json();
}

async function processUpdateOp(
  op: Extract<OfflineTaskOp, { kind: "update" }>,
  queryClient: QueryClient,
): Promise<"done" | "aborted"> {
  const body: Record<string, unknown> = { id: op.taskId, ...op.patch };
  if (op.baseUpdatedAt) body.baseUpdatedAt = op.baseUpdatedAt;
  let res = await apiFetch("PUT", `/api/tasks/${op.taskId}`, body);
  if (res.status === 409) {
    const j = await res.json();
    if (isTaskConflictPayload(j)) {
      res = await resolveUpdateConflict(
        op.taskId,
        { ...op.patch },
        j.serverTask as Task,
        op.baseUpdatedAt,
        queryClient,
      );
    }
  }
  if (res.status === 499) return "aborted";
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return "done";
}

async function processDeleteOp(
  op: Extract<OfflineTaskOp, { kind: "delete" }>,
  queryClient: QueryClient,
): Promise<"done" | "aborted"> {
  const qs =
    op.baseUpdatedAt !== null && op.baseUpdatedAt !== undefined
      ? `?baseUpdatedAt=${encodeURIComponent(op.baseUpdatedAt)}`
      : "";
  let res = await apiFetch("DELETE", `/api/tasks/${op.taskId}${qs}`);
  if (res.status === 409) {
    const j = await res.json();
    if (isTaskConflictPayload(j)) {
      const choice = await openConflictDialog({
        kind: "delete",
        taskId: op.taskId,
        serverTask: j.serverTask as Task,
        baseUpdatedAt: op.baseUpdatedAt,
      });
      if (choice === "server" || choice === "both") {
        await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        return "aborted";
      }
      const delQs2 =
        op.baseUpdatedAt !== null && op.baseUpdatedAt !== undefined
          ? `?overwrite=1&baseUpdatedAt=${encodeURIComponent(op.baseUpdatedAt)}`
          : "?overwrite=1";
      res = await apiFetch("DELETE", `/api/tasks/${op.taskId}${delQs2}`);
    }
  }
  if (!res.ok && res.status !== 204) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return "done";
}

let drainInProgress = false;

/** Flush queued ops in order; removes each op on success. Stops on first error (op left on queue). */
export async function drainOfflineTaskQueue(queryClient: QueryClient): Promise<void> {
  if (!isBrowserOnline() || drainInProgress) return;
  drainInProgress = true;

  const opDrainMeta = (op: OfflineTaskOp) => {
    const base = { kind: op.kind, opId: op.opId } as Record<string, unknown>;
    if (op.kind === "create") base.clientId = op.clientId;
    if (op.kind === "update" || op.kind === "delete") base.taskId = op.taskId;
    if (op.kind === "http") {
      base.method = op.method;
      base.path = op.path;
    }
    return base;
  };

  let ops = peekOfflineQueue();
  try {
    while (ops.length > 0) {
      const op = ops[0];
      try {
        switch (op.kind) {
          case "create": {
            const res = await apiFetch("POST", "/api/tasks", {
              ...op.payload,
              id: op.clientId,
            });
            if (!res.ok) throw new Error(await res.text());
            break;
          }
          case "update": {
            await processUpdateOp(op, queryClient);
            break;
          }
          case "delete": {
            await processDeleteOp(op, queryClient);
            break;
          }
          case "reorder": {
            const res = await apiRequest("PATCH", "/api/tasks/reorder", { taskIds: op.taskIds });
            if (!res.ok) throw new Error(await res.text());
            break;
          }
          case "http": {
            const res = await apiRequest(op.method, op.path, op.body);
            if (!res.ok && res.status !== 204) throw new Error(await res.text());
            break;
          }
          default:
            break;
        }
        removeOfflineOp(op.opId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[offline-task-queue] drain failed", { ...opDrainMeta(op), error: message, err });
        break;
      }
      ops = peekOfflineQueue();
    }

    await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
  } finally {
    drainInProgress = false;
  }
}

