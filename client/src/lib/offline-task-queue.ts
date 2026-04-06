import type { InsertTask } from "@shared/schema";
import { randomUuid } from "./uuid";

/** Legacy single key (pre–per-user namespacing); migrated on first read after login. */
export const OFFLINE_TASK_QUEUE_STORAGE_KEY = "axtask.offline_task_queue.v1";

const OFFLINE_QUEUE_KEY_PREFIX = "axtask.offline_task_queue.v1";
const MAX_QUEUE = 400;

/** Current signed-in user id for storage namespacing; set from auth (see `setOfflineQueueUserScope`). */
let offlineQueueScopeUserId: string | null = null;

export function setOfflineQueueUserScope(userId: string | null): void {
  offlineQueueScopeUserId = userId;
}

function storageKey(): string {
  if (offlineQueueScopeUserId) {
    return `${OFFLINE_QUEUE_KEY_PREFIX}:user:${offlineQueueScopeUserId}`;
  }
  return `${OFFLINE_QUEUE_KEY_PREFIX}:anonymous`;
}

export type OfflineTaskOp =
  | {
      v: 1;
      kind: "create";
      opId: string;
      clientId: string;
      payload: InsertTask;
      enqueuedAt: number;
    }
  | {
      v: 1;
      kind: "update";
      opId: string;
      taskId: string;
      /** Fields to merge into PUT body (no id / baseUpdatedAt). */
      patch: Record<string, unknown>;
      baseUpdatedAt: string | null;
      enqueuedAt: number;
    }
  | {
      v: 1;
      kind: "delete";
      opId: string;
      taskId: string;
      baseUpdatedAt: string | null;
      enqueuedAt: number;
    }
  | {
      v: 1;
      kind: "reorder";
      opId: string;
      taskIds: string[];
      enqueuedAt: number;
    }
  | {
      v: 1;
      kind: "http";
      opId: string;
      method: string;
      path: string;
      body: unknown;
      enqueuedAt: number;
    };

export type WriteQueueOutcome = {
  persistedToStorage: boolean;
  usingMemoryFallback: boolean;
  overflowed: boolean;
};

type Listener = () => void;
const listeners = new Set<Listener>();

/** When localStorage write fails, we keep the full queue here until a write succeeds. */
let memoryFallbackQueue: OfflineTaskOp[] | null = null;

function readQueue(): OfflineTaskOp[] {
  if (memoryFallbackQueue !== null) {
    return memoryFallbackQueue.slice();
  }
  try {
    const key = storageKey();
    let raw = localStorage.getItem(key);
    if (!raw && offlineQueueScopeUserId && key !== OFFLINE_TASK_QUEUE_STORAGE_KEY) {
      const legacy = localStorage.getItem(OFFLINE_TASK_QUEUE_STORAGE_KEY);
      if (legacy) {
        raw = legacy;
        try {
          localStorage.setItem(key, legacy);
          localStorage.removeItem(OFFLINE_TASK_QUEUE_STORAGE_KEY);
        } catch {
          /* keep legacy if copy fails */
        }
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineTaskOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persists the queue; reports persistence, memory fallback, and whether the queue was truncated. */
function writeQueue(ops: OfflineTaskOp[]): WriteQueueOutcome {
  const overflowed = ops.length > MAX_QUEUE;
  const truncated = ops.slice(-MAX_QUEUE);
  try {
    localStorage.setItem(storageKey(), JSON.stringify(truncated));
    memoryFallbackQueue = null;
    listeners.forEach((l) => l());
    return { persistedToStorage: true, usingMemoryFallback: false, overflowed };
  } catch {
    memoryFallbackQueue = truncated.slice();
    listeners.forEach((l) => l());
    return { persistedToStorage: false, usingMemoryFallback: true, overflowed };
  }
}

/** Remove a task from reorder ops; drop create/update/delete ops targeting taskId. */
function scrubQueueForDeletedTask(q: OfflineTaskOp[], taskId: string): OfflineTaskOp[] {
  const afterReorder: OfflineTaskOp[] = [];
  for (const o of q) {
    if (o.kind === "reorder") {
      const ids = o.taskIds.filter((id) => id !== taskId);
      if (ids.length === 0) continue;
      if (ids.length === o.taskIds.length) afterReorder.push(o);
      else afterReorder.push({ ...o, taskIds: ids, enqueuedAt: Date.now() });
      continue;
    }
    afterReorder.push(o);
  }
  return afterReorder.filter((o) => {
    if (o.kind === "create" && o.clientId === taskId) return false;
    if (o.kind === "update" && o.taskId === taskId) return false;
    if (o.kind === "delete" && o.taskId === taskId) return false;
    return true;
  });
}

function scrubHttpOpsForClientId(q: OfflineTaskOp[], clientId: string): OfflineTaskOp[] {
  const needle = `/api/tasks/${clientId}`;
  return q.filter((o) => {
    if (o.kind !== "http") return true;
    return !o.path.includes(needle) && !o.path.includes(`/api/tasks/${encodeURIComponent(clientId)}`);
  });
}

export function subscribeOfflineTaskQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOfflineQueueLength(): number {
  return readQueue().length;
}

export function clearOfflineTaskQueue(): void {
  memoryFallbackQueue = null;
  try {
    localStorage.removeItem(storageKey());
    localStorage.removeItem(OFFLINE_TASK_QUEUE_STORAGE_KEY);
  } catch {
    /* */
  }
  listeners.forEach((l) => l());
}

function newOpId(): string {
  return randomUuid();
}

/** Merge a new patch into an existing queued update (same baseUpdatedAt as first edit). */
export function enqueueTaskUpdate(
  taskId: string,
  patch: Record<string, unknown>,
  baseUpdatedAt: string | null,
): WriteQueueOutcome {
  const q = readQueue();
  const idx = q.findIndex((o) => o.kind === "update" && o.taskId === taskId);
  if (idx >= 0) {
    const prev = q[idx] as Extract<OfflineTaskOp, { kind: "update" }>;
    const merged = { ...prev.patch, ...patch };
    q[idx] = {
      ...prev,
      patch: merged,
      baseUpdatedAt: prev.baseUpdatedAt ?? baseUpdatedAt,
      enqueuedAt: Date.now(),
    };
    return writeQueue(q);
  }
  q.push({
    v: 1,
    kind: "update",
    opId: newOpId(),
    taskId,
    patch,
    baseUpdatedAt,
    enqueuedAt: Date.now(),
  });
  return writeQueue(q);
}

export function enqueueTaskCreate(clientId: string, payload: InsertTask): WriteQueueOutcome {
  const q = readQueue();
  const idx = q.findIndex((o) => o.kind === "create" && o.clientId === clientId);
  if (idx >= 0) {
    const prev = q[idx] as Extract<OfflineTaskOp, { kind: "create" }>;
    q[idx] = {
      ...prev,
      payload: { ...prev.payload, ...payload, id: clientId } as InsertTask,
      enqueuedAt: Date.now(),
    };
    return writeQueue(q);
  }
  q.push({
    v: 1,
    kind: "create",
    opId: newOpId(),
    clientId,
    payload: { ...payload, id: clientId } as InsertTask,
    enqueuedAt: Date.now(),
  });
  return writeQueue(q);
}

export function enqueueTaskDelete(taskId: string, baseUpdatedAt: string | null): WriteQueueOutcome {
  const q0 = readQueue();
  const removedOfflineCreate = q0.some((o) => o.kind === "create" && o.clientId === taskId);
  const q = scrubQueueForDeletedTask(q0, taskId);
  if (removedOfflineCreate) {
    return writeQueue(q);
  }
  q.push({
    v: 1,
    kind: "delete",
    opId: newOpId(),
    taskId,
    baseUpdatedAt,
    enqueuedAt: Date.now(),
  });
  return writeQueue(q);
}

export function enqueueTaskReorder(taskIds: string[]): WriteQueueOutcome {
  const q = readQueue();
  const idx = q.findIndex((o) => o.kind === "reorder");
  if (idx >= 0) {
    const prev = q[idx] as Extract<OfflineTaskOp, { kind: "reorder" }>;
    q[idx] = { ...prev, taskIds, enqueuedAt: Date.now() };
    return writeQueue(q);
  }
  q.push({ v: 1, kind: "reorder", opId: newOpId(), taskIds, enqueuedAt: Date.now() });
  return writeQueue(q);
}

export function enqueueHttpMutation(method: string, path: string, body: unknown): WriteQueueOutcome {
  const q = readQueue();
  q.push({
    v: 1,
    kind: "http",
    opId: newOpId(),
    method: method.toUpperCase(),
    path,
    body,
    enqueuedAt: Date.now(),
  });
  return writeQueue(q);
}

export function peekOfflineQueue(): OfflineTaskOp[] {
  return readQueue();
}

/** Drop one op by opId (after successful sync or user discard). */
export function removeOfflineOp(opId: string): WriteQueueOutcome {
  return writeQueue(readQueue().filter((o) => o.opId !== opId));
}

/** After a successful server update, align remaining queued updates for this task with the new concurrency base. */
export function refreshQueuedUpdateBasesForTask(taskId: string, newBaseUpdatedAt: string | null): boolean {
  const q = readQueue();
  let changed = false;
  const next = q.map((o) => {
    if (o.kind === "update" && o.taskId === taskId) {
      changed = true;
      return { ...o, baseUpdatedAt: newBaseUpdatedAt };
    }
    return o;
  });
  if (changed) {
    const o = writeQueue(next);
    return o.persistedToStorage || o.usingMemoryFallback;
  }
  return true;
}

/** Replace entire queue (used after conflict resolution / bulk retry). */
export function replaceOfflineQueue(ops: OfflineTaskOp[]): WriteQueueOutcome {
  return writeQueue(ops);
}

/**
 * After a failed offline "create" replay (e.g. 409), remap queued update/delete/reorder/http ops
 * from a provisional client id to the canonical server task id. If no server id is known,
 * drop queued ops that still target the client id so the drain does not stick.
 */
export function remapOrRemoveQueuedOpsForClientId(clientId: string, serverId: string | null): boolean {
  const q = readQueue();
  if (serverId) {
    const esc = encodeURIComponent(clientId);
    const next = q.map((o) => {
      if (o.kind === "update" && o.taskId === clientId) {
        return { ...o, taskId: serverId };
      }
      if (o.kind === "delete" && o.taskId === clientId) {
        return { ...o, taskId: serverId };
      }
      if (o.kind === "reorder") {
        const taskIds = o.taskIds.map((id) => (id === clientId ? serverId : id));
        if (taskIds.every((id, i) => id === o.taskIds[i])) return o;
        return { ...o, taskIds, enqueuedAt: Date.now() };
      }
      if (o.kind === "http") {
        let path = o.path;
        const before = path;
        path = path.replace(`/api/tasks/${clientId}`, `/api/tasks/${serverId}`);
        path = path.replace(`/api/tasks/${esc}`, `/api/tasks/${encodeURIComponent(serverId)}`);
        if (path !== before) {
          return { ...o, path, enqueuedAt: Date.now() };
        }
      }
      return o;
    });
    const w = writeQueue(next);
    return w.persistedToStorage || w.usingMemoryFallback;
  }
  let scrubbed = scrubQueueForDeletedTask(q, clientId);
  scrubbed = scrubHttpOpsForClientId(scrubbed, clientId);
  const w = writeQueue(scrubbed);
  return w.persistedToStorage || w.usingMemoryFallback;
}
