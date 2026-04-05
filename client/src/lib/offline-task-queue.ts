import type { InsertTask } from "@shared/schema";

export const OFFLINE_TASK_QUEUE_STORAGE_KEY = "axtask.offline_task_queue.v1";
const MAX_QUEUE = 400;

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

type Listener = () => void;
const listeners = new Set<Listener>();

function readQueue(): OfflineTaskOp[] {
  try {
    const raw = localStorage.getItem(OFFLINE_TASK_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineTaskOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(ops: OfflineTaskOp[]): void {
  try {
    localStorage.setItem(OFFLINE_TASK_QUEUE_STORAGE_KEY, JSON.stringify(ops.slice(-MAX_QUEUE)));
  } catch {
    /* quota / private mode */
  }
  listeners.forEach((l) => l());
}

export function subscribeOfflineTaskQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOfflineQueueLength(): number {
  return readQueue().length;
}

export function clearOfflineTaskQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_TASK_QUEUE_STORAGE_KEY);
  } catch {
    /* */
  }
  listeners.forEach((l) => l());
}

function newOpId(): string {
  return crypto.randomUUID();
}

/** Merge a new patch into an existing queued update (same baseUpdatedAt as first edit). */
export function enqueueTaskUpdate(
  taskId: string,
  patch: Record<string, unknown>,
  baseUpdatedAt: string | null,
): void {
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
    writeQueue(q);
    return;
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
  writeQueue(q);
}

export function enqueueTaskCreate(clientId: string, payload: InsertTask): void {
  const q = readQueue();
  const idx = q.findIndex((o) => o.kind === "create" && o.clientId === clientId);
  if (idx >= 0) {
    const prev = q[idx] as Extract<OfflineTaskOp, { kind: "create" }>;
    q[idx] = {
      ...prev,
      payload: { ...prev.payload, ...payload, id: clientId } as InsertTask,
      enqueuedAt: Date.now(),
    };
    writeQueue(q);
    return;
  }
  q.push({
    v: 1,
    kind: "create",
    opId: newOpId(),
    clientId,
    payload: { ...payload, id: clientId } as InsertTask,
    enqueuedAt: Date.now(),
  });
  writeQueue(q);
}

export function enqueueTaskDelete(taskId: string, baseUpdatedAt: string | null): void {
  const q = readQueue().filter((o) => {
    if (o.kind === "create" && o.clientId === taskId) return false;
    if (o.kind === "update" && o.taskId === taskId) return false;
    if (o.kind === "delete" && o.taskId === taskId) return false;
    return true;
  });
  q.push({
    v: 1,
    kind: "delete",
    opId: newOpId(),
    taskId,
    baseUpdatedAt,
    enqueuedAt: Date.now(),
  });
  writeQueue(q);
}

export function enqueueTaskReorder(taskIds: string[]): void {
  const q = readQueue();
  const idx = q.findIndex((o) => o.kind === "reorder");
  if (idx >= 0) {
    const prev = q[idx] as Extract<OfflineTaskOp, { kind: "reorder" }>;
    q[idx] = { ...prev, taskIds, enqueuedAt: Date.now() };
    writeQueue(q);
    return;
  }
  q.push({ v: 1, kind: "reorder", opId: newOpId(), taskIds, enqueuedAt: Date.now() });
  writeQueue(q);
}

export function enqueueHttpMutation(method: string, path: string, body: unknown): void {
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
  writeQueue(q);
}

export function peekOfflineQueue(): OfflineTaskOp[] {
  return readQueue();
}

/** Drop one op by opId (after successful sync or user discard). */
export function removeOfflineOp(opId: string): void {
  writeQueue(readQueue().filter((o) => o.opId !== opId));
}

/** Replace entire queue (used after conflict resolution / bulk retry). */
export function replaceOfflineQueue(ops: OfflineTaskOp[]): void {
  writeQueue(ops);
}
