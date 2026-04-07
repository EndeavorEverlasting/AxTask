import type { InsertTask } from "@shared/schema";
import { randomUuid } from "./uuid";

/** Legacy single key (pre–per-user namespacing); migrated on first read after login. */
export const OFFLINE_TASK_QUEUE_STORAGE_KEY = "axtask.offline_task_queue.v1";

const OFFLINE_QUEUE_KEY_PREFIX = "axtask.offline_task_queue.v1";
const MAX_QUEUE = 400;

/** Current signed-in user id for storage namespacing; set from auth (see `setOfflineQueueUserScope`). */
let offlineQueueScopeUserId: string | null = null;

/** While draining, all queue reads/writes pin to this storage key so scope cannot switch mid-run. */
let drainScopeStorageKey: string | null = null;

const SCOPED_USER_PREFIX = `${OFFLINE_QUEUE_KEY_PREFIX}:user:`;

const QUEUE_MUTEX_PREFIX = "axtask.offline_queue_mutex:";

/**
 * Serialize read-modify-write for a queue storage key across tabs (sync).
 * Falls back to running `fn` without a lock if storage is unavailable or acquisition times out.
 */
function withQueueKeyLock<T>(queueKey: string, fn: () => T): T {
  if (typeof localStorage === "undefined") return fn();
  const mutexStorageKey = `${QUEUE_MUTEX_PREFIX}${queueKey}`;
  const owner = randomUuid();
  const lockTtlMs = 2500;
  const spinUntil = Date.now() + 3000;
  const writePayload = (until: number) => JSON.stringify({ owner, until });

  while (Date.now() < spinUntil) {
    try {
      const raw = localStorage.getItem(mutexStorageKey);
      if (raw) {
        try {
          const o = JSON.parse(raw) as { owner?: string; until?: number };
          if (typeof o.until === "number" && o.until > Date.now()) {
            const t0 = Date.now();
            while (Date.now() - t0 < 2) {
              /* brief spin */
            }
            continue;
          }
        } catch {
          /* stale */
        }
      }
      const until = Date.now() + lockTtlMs;
      const payload = writePayload(until);
      localStorage.setItem(mutexStorageKey, payload);
      if (localStorage.getItem(mutexStorageKey) !== payload) continue;
      try {
        return fn();
      } finally {
        try {
          if (localStorage.getItem(mutexStorageKey) === payload) {
            localStorage.removeItem(mutexStorageKey);
          }
        } catch {
          /* */
        }
      }
    } catch {
      return fn();
    }
  }
  return fn();
}

/** Hold locks on two queue keys in canonical order to avoid deadlocks. */
function withTwoQueueKeyLocks<T>(keyA: string, keyB: string, fn: () => T): T {
  if (keyA === keyB) return withQueueKeyLock(keyA, fn);
  const [first, second] = keyA < keyB ? [keyA, keyB] : [keyB, keyA];
  return withQueueKeyLock(first, () => withQueueKeyLock(second, fn));
}

function clearOfflineQueueStorageKey(key: string): void {
  withQueueKeyLock(key, () => {
    memoryFallbackQueues.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* */
    }
    listeners.forEach((l) => l());
  });
}

/** `null` = anonymous bucket; non-null = authenticated user id from the storage key. */
function userIdFromOfflineStorageKey(key: string): string | null {
  if (key === `${OFFLINE_QUEUE_KEY_PREFIX}:anonymous`) return null;
  if (key.startsWith(SCOPED_USER_PREFIX)) {
    const id = key.slice(SCOPED_USER_PREFIX.length);
    return id.length > 0 ? id : null;
  }
  return null;
}

/** Merge queues when both keys are anonymous, when upgrading from anonymous to signed-in, or when both belong to the same user. */
function mayMergeOfflineQueueScopes(prevKey: string, nextKey: string): boolean {
  const a = userIdFromOfflineStorageKey(prevKey);
  const b = userIdFromOfflineStorageKey(nextKey);
  if (a === null && b === null) return true;
  if (a === null) return true;
  return a !== null && b !== null && a === b;
}

function migrateQueueBetweenKeys(prevKey: string, nextKey: string): void {
  if (prevKey === nextKey) return;
  withTwoQueueKeyLocks(prevKey, nextKey, () => {
    const prevOps = readQueueForKey(prevKey);
    if (prevOps.length === 0 || !mayMergeOfflineQueueScopes(prevKey, nextKey)) {
      listeners.forEach((l) => l());
      return;
    }
    const nextExisting = readQueueForKey(nextKey);
    const merged = [...prevOps, ...nextExisting];
    const lastIdx = new Map<string, number>();
    merged.forEach((op, i) => lastIdx.set(op.opId, i));
    let deduped = merged
      .filter((op, i) => lastIdx.get(op.opId) === i)
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    if (deduped.length > MAX_QUEUE) {
      deduped = deduped.slice(-MAX_QUEUE);
    }
    const outcome = persistQueueForKey(nextKey, deduped);
    if (outcome.persistedToStorage) {
      memoryFallbackQueues.delete(prevKey);
      try {
        localStorage.removeItem(prevKey);
      } catch {
        /* */
      }
    }
  });
}

export function setOfflineQueueUserScope(userId: string | null): void {
  if (drainScopeStorageKey !== null) {
    offlineQueueScopeUserId = userId;
    listeners.forEach((l) => l());
    return;
  }
  const prevKey = storageKey();
  offlineQueueScopeUserId = userId;
  const nextKey = storageKey();
  if (prevKey !== nextKey && mayMergeOfflineQueueScopes(prevKey, nextKey)) {
    migrateQueueBetweenKeys(prevKey, nextKey);
  }
}

function storageKey(): string {
  if (offlineQueueScopeUserId) {
    return `${OFFLINE_QUEUE_KEY_PREFIX}:user:${offlineQueueScopeUserId}`;
  }
  return `${OFFLINE_QUEUE_KEY_PREFIX}:anonymous`;
}

function queueStorageKey(): string {
  return drainScopeStorageKey ?? storageKey();
}

/** Pin queue I/O to the current scope for the duration of a drain (call `endOfflineQueueDrainScope` in finally). */
export function beginOfflineQueueDrainScope(): void {
  drainScopeStorageKey = storageKey();
}

export function endOfflineQueueDrainScope(): void {
  const pinned = drainScopeStorageKey;
  drainScopeStorageKey = null;
  if (!pinned) return;
  migrateQueueBetweenKeys(pinned, storageKey());
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

/** When localStorage write fails, we keep the full queue here per storage key until a write succeeds. */
const memoryFallbackQueues = new Map<string, OfflineTaskOp[]>();

function readQueueForKey(key: string): OfflineTaskOp[] {
  const mem = memoryFallbackQueues.get(key);
  if (mem !== undefined) {
    return mem.slice();
  }
  try {
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

function readQueue(): OfflineTaskOp[] {
  return readQueueForKey(queueStorageKey());
}

/** Persists the queue; no lock — callers must hold `withQueueKeyLock` when mutating. */
function persistQueueForKey(key: string, ops: OfflineTaskOp[]): WriteQueueOutcome {
  const overflowed = ops.length > MAX_QUEUE;
  const toStore = overflowed ? ops.slice(-MAX_QUEUE) : ops;
  try {
    localStorage.setItem(key, JSON.stringify(toStore));
    memoryFallbackQueues.delete(key);
    listeners.forEach((l) => l());
    return { persistedToStorage: true, usingMemoryFallback: false, overflowed };
  } catch {
    memoryFallbackQueues.set(key, toStore.slice());
    listeners.forEach((l) => l());
    return { persistedToStorage: false, usingMemoryFallback: true, overflowed };
  }
}

function writeQueue(ops: OfflineTaskOp[]): WriteQueueOutcome {
  const k = queueStorageKey();
  return withQueueKeyLock(k, () => persistQueueForKey(k, ops));
}

function mutateCurrentQueue(updater: (q: OfflineTaskOp[]) => OfflineTaskOp[]): WriteQueueOutcome {
  const k = queueStorageKey();
  return withQueueKeyLock(k, () => {
    const q = readQueueForKey(k);
    const next = updater(q);
    return persistQueueForKey(k, next);
  });
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

function tryParseJsonBody(body: unknown): { ok: true; value: unknown } | { ok: false } {
  if (body === null || body === undefined) return { ok: true, value: {} };
  if (typeof body === "object") return { ok: true, value: body };
  if (typeof body === "string") {
    const s = body.trim();
    if (!s) return { ok: true, value: {} };
    try {
      return { ok: true, value: JSON.parse(s) };
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}

function jsonContainsClientIdString(val: unknown, clientId: string): boolean {
  const esc = encodeURIComponent(clientId);
  let found = false;
  function walk(x: unknown): void {
    if (found) return;
    if (typeof x === "string") {
      if (x === clientId || x === esc) found = true;
      return;
    }
    if (Array.isArray(x)) {
      x.forEach(walk);
      return;
    }
    if (x && typeof x === "object") Object.values(x as object).forEach(walk);
  }
  walk(val);
  return found;
}

function deepReplaceClientIdInJson(val: unknown, clientId: string, serverId: string): unknown {
  const escC = encodeURIComponent(clientId);
  const escS = encodeURIComponent(serverId);
  if (typeof val === "string") {
    if (val === clientId) return serverId;
    if (val === escC) return escS;
    return val;
  }
  if (Array.isArray(val)) return val.map((x) => deepReplaceClientIdInJson(x, clientId, serverId));
  if (val && typeof val === "object") {
    const o = val as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = deepReplaceClientIdInJson(v, clientId, serverId);
    }
    return out;
  }
  return val;
}

function httpBodyReferencesClientId(o: Extract<OfflineTaskOp, { kind: "http" }>, clientId: string): boolean {
  const parsed = tryParseJsonBody(o.body);
  if (parsed.ok) return jsonContainsClientIdString(parsed.value, clientId);
  if (typeof o.body === "string") {
    return o.body.includes(clientId) || o.body.includes(encodeURIComponent(clientId));
  }
  if (
    o.body === null ||
    o.body === undefined ||
    typeof o.body === "number" ||
    typeof o.body === "boolean" ||
    typeof o.body === "bigint" ||
    typeof o.body === "symbol"
  ) {
    return false;
  }
  return jsonContainsClientIdString(o.body, clientId);
}

function remapHttpOpForClientId(
  o: Extract<OfflineTaskOp, { kind: "http" }>,
  clientId: string,
  serverId: string | null,
): Extract<OfflineTaskOp, { kind: "http" }> | null {
  const esc = encodeURIComponent(clientId);
  const pathTouches =
    o.path.includes(`/api/tasks/${clientId}`) || o.path.includes(`/api/tasks/${esc}`);

  if (serverId === null) {
    if (pathTouches) return null;
    if (httpBodyReferencesClientId(o, clientId)) return null;
    return o;
  }

  let path = o.path;
  if (pathTouches) {
    path = path
      .replace(`/api/tasks/${clientId}`, `/api/tasks/${serverId}`)
      .replace(`/api/tasks/${esc}`, `/api/tasks/${encodeURIComponent(serverId)}`);
  }

  const parsed = tryParseJsonBody(o.body);
  if (!parsed.ok) {
    if (typeof o.body === "string") {
      try {
        const j = JSON.parse(o.body) as unknown;
        const next = deepReplaceClientIdInJson(j, clientId, serverId);
        return { ...o, path, body: JSON.stringify(next), enqueuedAt: Date.now() };
      } catch {
        return httpBodyReferencesClientId(o, clientId) ? null : { ...o, path, enqueuedAt: Date.now() };
      }
    }
    return httpBodyReferencesClientId(o, clientId) ? null : { ...o, path, enqueuedAt: Date.now() };
  }

  if (jsonContainsClientIdString(parsed.value, clientId)) {
    const nextVal = deepReplaceClientIdInJson(parsed.value, clientId, serverId);
    const bodyOut = typeof o.body === "string" ? JSON.stringify(nextVal) : nextVal;
    return { ...o, path, body: bodyOut, enqueuedAt: Date.now() };
  }

  return path !== o.path ? { ...o, path, enqueuedAt: Date.now() } : o;
}

function scrubHttpOpsForClientId(q: OfflineTaskOp[], clientId: string): OfflineTaskOp[] {
  const out: OfflineTaskOp[] = [];
  for (const o of q) {
    if (o.kind !== "http") {
      out.push(o);
      continue;
    }
    const remapped = remapHttpOpForClientId(o, clientId, null);
    if (remapped) out.push(remapped);
  }
  return out;
}

export function subscribeOfflineTaskQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOfflineQueueLength(): number {
  return readQueue().length;
}

export function clearOfflineTaskQueue(): void {
  const key = queueStorageKey();
  withQueueKeyLock(key, () => {
    memoryFallbackQueues.delete(key);
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(OFFLINE_TASK_QUEUE_STORAGE_KEY);
    } catch {
      /* */
    }
    listeners.forEach((l) => l());
  });
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
  return mutateCurrentQueue((q) => {
    const idx = q.findIndex((o) => o.kind === "update" && o.taskId === taskId);
    if (idx >= 0) {
      const prev = q[idx] as Extract<OfflineTaskOp, { kind: "update" }>;
      const merged = { ...prev.patch, ...patch };
      const next = q.slice();
      next[idx] = {
        ...prev,
        patch: merged,
        baseUpdatedAt: prev.baseUpdatedAt ?? baseUpdatedAt,
        enqueuedAt: Date.now(),
      };
      return next;
    }
    return [
      ...q,
      {
        v: 1,
        kind: "update",
        opId: newOpId(),
        taskId,
        patch,
        baseUpdatedAt,
        enqueuedAt: Date.now(),
      },
    ];
  });
}

export function enqueueTaskCreate(clientId: string, payload: InsertTask): WriteQueueOutcome {
  return mutateCurrentQueue((q) => {
    const idx = q.findIndex((o) => o.kind === "create" && o.clientId === clientId);
    if (idx >= 0) {
      const prev = q[idx] as Extract<OfflineTaskOp, { kind: "create" }>;
      const next = q.slice();
      next[idx] = {
        ...prev,
        payload: { ...prev.payload, ...payload, id: clientId } as InsertTask,
        enqueuedAt: Date.now(),
      };
      return next;
    }
    return [
      ...q,
      {
        v: 1,
        kind: "create",
        opId: newOpId(),
        clientId,
        payload: { ...payload, id: clientId } as InsertTask,
        enqueuedAt: Date.now(),
      },
    ];
  });
}

export function enqueueTaskDelete(taskId: string, baseUpdatedAt: string | null): WriteQueueOutcome {
  return mutateCurrentQueue((q0) => {
    const removedOfflineCreate = q0.some((o) => o.kind === "create" && o.clientId === taskId);
    let q = scrubHttpOpsForClientId(scrubQueueForDeletedTask(q0, taskId), taskId);
    if (removedOfflineCreate) {
      return q;
    }
    return [
      ...q,
      {
        v: 1,
        kind: "delete",
        opId: newOpId(),
        taskId,
        baseUpdatedAt,
        enqueuedAt: Date.now(),
      },
    ];
  });
}

export function enqueueTaskReorder(taskIds: string[]): WriteQueueOutcome {
  return mutateCurrentQueue((q) => {
    const idx = q.findIndex((o) => o.kind === "reorder");
    if (idx >= 0) {
      const prev = q[idx] as Extract<OfflineTaskOp, { kind: "reorder" }>;
      const next = q.slice();
      next[idx] = { ...prev, taskIds, enqueuedAt: Date.now() };
      return next;
    }
    return [...q, { v: 1, kind: "reorder", opId: newOpId(), taskIds, enqueuedAt: Date.now() }];
  });
}

export function enqueueHttpMutation(method: string, path: string, body: unknown): WriteQueueOutcome {
  return mutateCurrentQueue((q) => [
    ...q,
    {
      v: 1,
      kind: "http",
      opId: newOpId(),
      method: method.toUpperCase(),
      path,
      body,
      enqueuedAt: Date.now(),
    },
  ]);
}

export function peekOfflineQueue(): OfflineTaskOp[] {
  return readQueue();
}

/** Drop one op by opId (after successful sync or user discard). */
export function removeOfflineOp(opId: string): WriteQueueOutcome {
  return mutateCurrentQueue((q) => q.filter((o) => o.opId !== opId));
}

/** After a successful server update, align remaining queued updates for this task with the new concurrency base. */
export function refreshQueuedUpdateBasesForTask(taskId: string, newBaseUpdatedAt: string | null): boolean {
  const k = queueStorageKey();
  return withQueueKeyLock(k, () => {
    const q = readQueueForKey(k);
    let changed = false;
    const next = q.map((op) => {
      if ((op.kind === "update" || op.kind === "delete") && op.taskId === taskId) {
        changed = true;
        return { ...op, baseUpdatedAt: newBaseUpdatedAt };
      }
      return op;
    });
    if (!changed) return true;
    const o = persistQueueForKey(k, next);
    return o.persistedToStorage || o.usingMemoryFallback;
  });
}

/** Replace entire queue (used after conflict resolution / bulk retry). */
export function replaceOfflineQueue(ops: OfflineTaskOp[]): WriteQueueOutcome {
  const capped = ops.length > MAX_QUEUE ? ops.slice(-MAX_QUEUE) : ops;
  return writeQueue(capped);
}

/**
 * After a failed offline "create" replay (e.g. 409), remap queued update/delete/reorder/http ops
 * from a provisional client id to the canonical server task id. If no server id is known,
 * drop queued ops that still target the client id so the drain does not stick.
 */
export function remapOrRemoveQueuedOpsForClientId(clientId: string, serverId: string | null): boolean {
  const w = mutateCurrentQueue((q) => {
    if (serverId) {
      const next: OfflineTaskOp[] = [];
      for (const o of q) {
        if (o.kind === "update" && o.taskId === clientId) {
          next.push({ ...o, taskId: serverId });
          continue;
        }
        if (o.kind === "delete" && o.taskId === clientId) {
          next.push({ ...o, taskId: serverId });
          continue;
        }
        if (o.kind === "reorder") {
          const taskIds = o.taskIds.map((id) => (id === clientId ? serverId : id));
          if (taskIds.every((id, i) => id === o.taskIds[i])) next.push(o);
          else next.push({ ...o, taskIds, enqueuedAt: Date.now() });
          continue;
        }
        if (o.kind === "http") {
          const r = remapHttpOpForClientId(o, clientId, serverId);
          if (r) next.push(r);
          continue;
        }
        next.push(o);
      }
      return next;
    }
    let scrubbed = scrubQueueForDeletedTask(q, clientId);
    scrubbed = scrubHttpOpsForClientId(scrubbed, clientId);
    return scrubbed;
  });
  return w.persistedToStorage || w.usingMemoryFallback;
}
