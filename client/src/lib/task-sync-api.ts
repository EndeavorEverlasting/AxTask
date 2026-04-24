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
  refreshQueuedUpdateBasesForTask,
  remapOrRemoveQueuedOpsForClientId,
  beginOfflineQueueDrainScope,
  endOfflineQueueDrainScope,
  type OfflineTaskOp,
  type WriteQueueOutcome,
} from "./offline-task-queue";
import { openConflictDialog, type ConflictChoice } from "./task-conflict-deferred";
import { randomUuid } from "./uuid";
import { applyWalletRewardHybrid } from "./wallet-cache";
import { recordTaskCompletedForPrediction } from "./local-markov-predictions";

const DRAIN_LS_MUTEX_KEY = "axtask.offline_drain_mutex";

async function withOfflineDrainLock(run: () => Promise<void>): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    await navigator.locks.request("offline-task-drain", { mode: "exclusive" }, run);
    return;
  }
  const owner = randomUuid();
  const HEARTBEAT_MS = 25_000;
  const EXTEND_MS = 120_000;

  function releaseDrainLockIfOwner(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(DRAIN_LS_MUTEX_KEY);
      if (!raw) return;
      const o = JSON.parse(raw) as { owner?: string };
      if (o.owner === owner) {
        localStorage.removeItem(DRAIN_LS_MUTEX_KEY);
      }
    } catch {
      /* */
    }
  }

  for (let i = 0; i < 200; i++) {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(DRAIN_LS_MUTEX_KEY);
        if (raw) {
          try {
            const o = JSON.parse(raw) as { until?: number };
            if (typeof o.until === "number" && o.until > Date.now()) {
              await new Promise((r) => setTimeout(r, 25));
              continue;
            }
          } catch {
            /* */
          }
        }
        const until = Date.now() + 120_000;
        const payload = JSON.stringify({ owner, until });
        localStorage.setItem(DRAIN_LS_MUTEX_KEY, payload);
        if (localStorage.getItem(DRAIN_LS_MUTEX_KEY) !== payload) continue;
      }
      let hb: ReturnType<typeof setInterval> | undefined;
      try {
        if (typeof localStorage !== "undefined") {
          hb = setInterval(() => {
            try {
              const raw2 = localStorage.getItem(DRAIN_LS_MUTEX_KEY);
              if (!raw2) return;
              const o2 = JSON.parse(raw2) as { owner?: string };
              if (o2.owner !== owner) return;
              localStorage.setItem(
                DRAIN_LS_MUTEX_KEY,
                JSON.stringify({ owner, until: Date.now() + EXTEND_MS }),
              );
            } catch {
              /* */
            }
          }, HEARTBEAT_MS);
        }
        await run();
      } finally {
        if (hb !== undefined) clearInterval(hb);
        releaseDrainLockIfOwner();
      }
      return;
    } catch (err) {
      throw err;
    }
  }
  throw new Error("failed to acquire offline drain lock");
}

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

function pathWithoutQuery(path: string): string {
  const i = path.indexOf("?");
  return i >= 0 ? path.slice(0, i) : path;
}

/** Indices in `results` where `success === false` (partial `/api/tasks/review/apply` responses). */
function reviewApplyFailedActionIndices(json: unknown): number[] {
  const o = json as { results?: Array<{ success?: boolean } | null | undefined> };
  if (!Array.isArray(o.results)) return [];
  const out: number[] = [];
  o.results.forEach((r, i) => {
    if (r && r.success === false) out.push(i);
  });
  return out;
}

/** Safe to auto-retry the same action later (excludes conflicts — those need user resolution). */
function reviewApplyFailureIsTransientRetry(result: {
  error?: string;
  retryable?: boolean;
}): boolean {
  if (result.error === "conflict") return false;
  if (result.retryable === true) return true;
  if (result.retryable === false) return false;
  return result.error === "Processing error";
}

function reviewApplyFailureIsConflict(result: { error?: string }): boolean {
  return result.error === "conflict";
}

function safeJsonParse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function extractTaskPatchFromHttpBody(body: unknown): Record<string, unknown> {
  const raw =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>) }
      : ({} as Record<string, unknown>);
  delete raw.id;
  delete raw.baseUpdatedAt;
  delete raw.forceOverwrite;
  return raw;
}

function parseBaseUpdatedAtFromTaskDeletePath(path: string): string | null {
  const q = path.indexOf("?");
  if (q < 0) return null;
  const params = new URLSearchParams(path.slice(q + 1));
  const v = params.get("baseUpdatedAt");
  return v && v.length > 0 ? v : null;
}

/**
 * When the server returns a task conflict payload (409 or JSON body with task_conflict),
 * run the same resolution flow as syncUpdateTask / syncDeleteTask and return the follow-up Response.
 */
async function applyTaskConflictResolutionIfNeeded(
  res: Response,
  queryClient: QueryClient,
  method: string,
  path: string,
  body: unknown,
): Promise<Response> {
  if (res.ok) return res;
  const text = await res.text();
  const parsed = safeJsonParse(text);
  if (!isTaskConflictPayload(parsed)) {
    throw new Error(text || res.statusText);
  }
  const serverTask = parsed.serverTask as Task;
  const basePath = pathWithoutQuery(path);
  const pathMatch = basePath.match(/^\/api\/tasks\/([^/]+)$/);
  const taskId =
    typeof serverTask?.id === "string" && serverTask.id.length > 0
      ? serverTask.id
      : pathMatch
        ? decodeURIComponent(pathMatch[1])
        : null;
  if (!taskId) {
    throw new Error(text || res.statusText);
  }

  if (method === "PUT" || method === "PATCH") {
    const patch = extractTaskPatchFromHttpBody(body);
    return resolveUpdateConflict(
      taskId,
      patch,
      serverTask,
      taskUpdatedAtIso(serverTask),
      queryClient,
    );
  }

  if (method === "DELETE") {
    const baseUpdatedAt = parseBaseUpdatedAtFromTaskDeletePath(path) ?? taskUpdatedAtIso(serverTask);
    const choice = await openConflictDialog({
      kind: "delete",
      taskId,
      serverTask,
      baseUpdatedAt,
    });
    if (choice === "aborted") {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      return new Response(null, { status: 499 });
    }
    if (choice === "server" || choice === "both") {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      return new Response(null, { status: 204 });
    }
    const delQs =
      baseUpdatedAt !== null && baseUpdatedAt !== undefined
        ? `?overwrite=1&baseUpdatedAt=${encodeURIComponent(baseUpdatedAt)}`
        : "?overwrite=1";
    return apiFetch("DELETE", `/api/tasks/${taskId}${delQs}`);
  }

  throw new Error(text || res.statusText);
}

async function parseHttpSyncResponse(res: Response, path: string): Promise<unknown> {
  if (res.status === 204) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  const base = pathWithoutQuery(path);
  if (base === "/api/tasks/review/apply") {
    const text = await res.text();
    return safeJsonParse(text);
  }
  return res.json();
}

function assertEnqueueOk(o: WriteQueueOutcome, context: string): void {
  if (!o.persistedToStorage && !o.usingMemoryFallback) {
    throw new Error("Could not save offline queue");
  }
  if (o.overflowed) {
    console.warn(
      `[offline-task-queue] ${context}: queue overflow; oldest operations were dropped (newest retained up to the offline queue cap)`,
    );
  }
}

export function taskUpdatedAtIso(task: Task | undefined): string | null {
  if (!task?.updatedAt) return null;
  const d = task.updatedAt;
  return typeof d === "string" ? d : new Date(d).toISOString();
}

function resolveUserIdForPrediction(queryClient: QueryClient, taskId: string, baseTask?: Task): string {
  return (
    baseTask?.userId ??
    queryClient.getQueryData<Task[]>(["/api/tasks"])?.find((t) => t.id === taskId)?.userId ??
    ""
  );
}

export function optimisticTaskFromInsert(data: InsertTask, id: string, userId: string): Task {
  const now = new Date();
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
    classificationAssociations: [{ label: "General", confidence: 1 }],
    status: data.status ?? "pending",
    isRepeated: false,
    sortOrder: 0,
    visibility: "private",
    communityShowNotes: false,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    durationMinutes: data.durationMinutes ?? null,
    dependsOn: data.dependsOn ?? null,
    createdAt: now,
    updatedAt: now,
  };
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
  if (choice === "aborted") {
    await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
    return new Response(null, { status: 499 });
  }
  if (choice === "server" || choice === "both") {
    await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
    return new Response(JSON.stringify(serverTask), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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
    const clientId = randomUuid();
    assertEnqueueOk(enqueueTaskCreate(clientId, data), "enqueueTaskCreate");
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
    if (!baseTask || !baseUpdatedAt) {
      throw new Error(
        "Cannot save changes offline without the latest task data. Connect or refresh tasks, then try again.",
      );
    }
    const shallow: Record<string, unknown> = { ...shallowIn };
    assertEnqueueOk(enqueueTaskUpdate(taskId, shallow, baseUpdatedAt), "enqueueTaskUpdate");
    mergeTaskInCache(queryClient, taskId, shallow);
    const merged = { ...baseTask, ...shallow } as Task;
    if (merged.status === "completed" && baseTask && baseTask.status !== "completed") {
      void recordTaskCompletedForPrediction({
        userId: resolveUserIdForPrediction(queryClient, taskId, baseTask),
        task: merged,
        previousStatus: baseTask.status,
      });
    }
    return { offlineQueued: true };
  }

  let res = await apiFetch("PUT", `/api/tasks/${taskId}`, body);
  if (res.status === 409) {
    const text409 = await res.text();
    const parsed = safeJsonParse(text409);
    if (isTaskConflictPayload(parsed)) {
      res = await resolveUpdateConflict(
        taskId,
        { ...shallowIn },
        parsed.serverTask as Task,
        baseUpdatedAt,
        queryClient,
      );
    } else {
      throw new Error(text409 || res.statusText);
    }
  }
  if (res.status === 499) {
    throw new TaskSyncAbortedError("Discarded in favor of server data.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  const updated = (await res.json()) as Task;
  if (updated.status === "completed" && baseTask && baseTask.status !== "completed") {
    void recordTaskCompletedForPrediction({
      userId: resolveUserIdForPrediction(queryClient, taskId, baseTask),
      task: updated,
      previousStatus: baseTask.status,
    });
  }
  return updated;
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
    if (!baseTask || !baseUpdatedAt) {
      throw new Error(
        "Cannot delete offline without the latest task version. Connect or refresh tasks, then try again.",
      );
    }
    assertEnqueueOk(enqueueTaskDelete(taskId, baseUpdatedAt), "enqueueTaskDelete");
    removeTaskFromCache(queryClient, taskId);
    return;
  }

  let res = await apiFetch("DELETE", `/api/tasks/${taskId}${qs}`);
  if (res.status === 409) {
    const text409 = await res.text();
    const parsed = safeJsonParse(text409);
    if (isTaskConflictPayload(parsed)) {
      const choice = await openConflictDialog({
        kind: "delete",
        taskId,
        serverTask: parsed.serverTask as Task,
        baseUpdatedAt,
      });
      if (choice === "aborted") {
        throw new TaskSyncAbortedError("Conflict dialog dismissed.");
      }
      if (choice === "server" || choice === "both") {
        await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
        return;
      }
      const delQs =
        baseUpdatedAt !== null && baseUpdatedAt !== undefined
          ? `?overwrite=1&baseUpdatedAt=${encodeURIComponent(baseUpdatedAt)}`
          : "?overwrite=1";
      res = await apiFetch("DELETE", `/api/tasks/${taskId}${delQs}`);
    } else {
      throw new Error(text409 || res.statusText);
    }
  }
  if (!res.ok && res.status !== 204) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
}

export async function syncReorderTasks(taskIds: string[], queryClient: QueryClient): Promise<void> {
  if (!isBrowserOnline()) {
    assertEnqueueOk(enqueueTaskReorder(taskIds), "enqueueTaskReorder");
    queryClient.setQueryData<Task[]>(["/api/tasks"], (old) => {
      if (!old) return old;
      const byId = new Map(old.map((t) => [t.id, t]));
      const ordered = taskIds.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t));
      const inReorder = new Set(taskIds);
      const tail = old.filter((t) => !inReorder.has(t.id));
      return [...ordered, ...tail];
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
    assertEnqueueOk(enqueueHttpMutation(method, path, body), "enqueueHttpMutation");
    return { offlineQueued: true };
  }
  let res = await apiFetch(method, path, body);
  res = await applyTaskConflictResolutionIfNeeded(res, queryClient, method, path, body);
  if (res.status === 499) {
    throw new TaskSyncAbortedError("Discarded in favor of server data.");
  }
  return parseHttpSyncResponse(res, path);
}

async function processUpdateOp(
  op: Extract<OfflineTaskOp, { kind: "update" }>,
  queryClient: QueryClient,
): Promise<"done" | "aborted"> {
  const tasks = queryClient.getQueryData<Task[]>(["/api/tasks"]);
  const cached = tasks?.find((t) => t.id === op.taskId);
  const effectiveBase = op.baseUpdatedAt ?? taskUpdatedAtIso(cached);
  const body: Record<string, unknown> = { id: op.taskId, ...op.patch };
  if (effectiveBase) body.baseUpdatedAt = effectiveBase;
  let res = await apiFetch("PUT", `/api/tasks/${op.taskId}`, body);
  if (res.status === 409) {
    const text409 = await res.text();
    const parsed = safeJsonParse(text409);
    if (isTaskConflictPayload(parsed)) {
      res = await resolveUpdateConflict(
        op.taskId,
        { ...op.patch },
        parsed.serverTask as Task,
        effectiveBase,
        queryClient,
      );
    } else {
      throw new Error(text409 || res.statusText);
    }
  }
  if (res.status === 499) return "aborted";
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  const updated = (await res.json()) as Task & {
    walletBalance?: number | null;
  };
  refreshQueuedUpdateBasesForTask(op.taskId, taskUpdatedAtIso(updated));
  mergeTaskInCache(queryClient, op.taskId, updated as Record<string, unknown>);
  void queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
  if (typeof updated.walletBalance === "number") {
    applyWalletRewardHybrid(queryClient, { balance: updated.walletBalance });
  } else if ("status" in op.patch && op.patch.status !== undefined) {
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
  }
  if (op.patch.status === "completed" && cached && cached.status !== "completed") {
    void recordTaskCompletedForPrediction({
      userId: resolveUserIdForPrediction(queryClient, op.taskId, cached),
      task: updated,
      previousStatus: cached.status,
    });
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
    const text409 = await res.text();
    const parsed = safeJsonParse(text409);
    if (isTaskConflictPayload(parsed)) {
      const choice = await openConflictDialog({
        kind: "delete",
        taskId: op.taskId,
        serverTask: parsed.serverTask as Task,
        baseUpdatedAt: op.baseUpdatedAt,
      });
      if (choice === "aborted") {
        await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        return "aborted";
      }
      if (choice === "server" || choice === "both") {
        await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
        return "done";
      }
      const delQs2 =
        op.baseUpdatedAt !== null && op.baseUpdatedAt !== undefined
          ? `?overwrite=1&baseUpdatedAt=${encodeURIComponent(op.baseUpdatedAt)}`
          : "?overwrite=1";
      res = await apiFetch("DELETE", `/api/tasks/${op.taskId}${delQs2}`);
    } else {
      throw new Error(text409 || res.statusText);
    }
  }
  if (!res.ok && res.status !== 204) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  removeTaskFromCache(queryClient, op.taskId);
  await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
  await queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
  return "done";
}

/** Flush queued ops in order; removes each op on success. Stops on first error (op left on queue). */
export async function drainOfflineTaskQueue(queryClient: QueryClient): Promise<void> {
  if (!isBrowserOnline()) return;

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

  await withOfflineDrainLock(async () => {
    let ops: OfflineTaskOp[] = [];
    let drainStoppedEarly = false;
    try {
      beginOfflineQueueDrainScope();
      ops = peekOfflineQueue();
      while (ops.length > 0) {
        const op = ops[0];
        try {
          let syncAborted = false;
          let shouldRemoveOp = true;
          switch (op.kind) {
          case "create": {
            const res = await apiFetch("POST", "/api/tasks", {
              ...op.payload,
              id: op.clientId,
            });
            if (res.status === 409) {
              let serverId: string | null = null;
              const raw = await res.text();
              try {
                const j = raw ? (JSON.parse(raw) as { serverTask?: { id?: string } }) : null;
                const sid = j?.serverTask?.id;
                if (typeof sid === "string" && sid.length > 0) serverId = sid;
              } catch {
                /* ignore */
              }
              if (!serverId) {
                const getRes = await apiFetch("GET", `/api/tasks/${encodeURIComponent(op.clientId)}`);
                if (getRes.ok) {
                  const t = (await getRes.json()) as Task;
                  if (t?.id) serverId = t.id;
                }
              }
              if (serverId) {
                remapOrRemoveQueuedOpsForClientId(op.clientId, serverId);
                const getRes = await apiFetch("GET", `/api/tasks/${encodeURIComponent(serverId)}`);
                if (getRes.ok) {
                  const t = (await getRes.json()) as Task;
                  queryClient.setQueryData<Task[]>(["/api/tasks"], (old) => {
                    if (!old) return old;
                    const filtered = old.filter((x) => x.id !== op.clientId && x.id !== t.id);
                    return [...filtered, t];
                  });
                  refreshQueuedUpdateBasesForTask(t.id, taskUpdatedAtIso(t));
                  void queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
                  void queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
                }
              } else {
                shouldRemoveOp = false;
                drainStoppedEarly = true;
                syncAborted = true;
              }
              break;
            }
            if (!res.ok) throw new Error(await res.text());
            const serverTask = (await res.json()) as Task;
            remapOrRemoveQueuedOpsForClientId(op.clientId, serverTask.id);
            queryClient.setQueryData<Task[]>(["/api/tasks"], (old) => {
              if (!old) return old;
              const filtered = old.filter((t) => t.id !== op.clientId && t.id !== serverTask.id);
              return [...filtered, serverTask];
            });
            refreshQueuedUpdateBasesForTask(serverTask.id, taskUpdatedAtIso(serverTask));
            void queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
            void queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
            break;
          }
          case "update": {
            const ur = await processUpdateOp(op, queryClient);
            if (ur === "aborted") syncAborted = true;
            break;
          }
          case "delete": {
            const dr = await processDeleteOp(op, queryClient);
            if (dr === "aborted") syncAborted = true;
            break;
          }
          case "reorder": {
            const res = await apiRequest("PATCH", "/api/tasks/reorder", { taskIds: op.taskIds });
            if (!res.ok) throw new Error(await res.text());
            await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
            break;
          }
          case "http": {
            let res = await apiFetch(op.method, op.path, op.body);
            res = await applyTaskConflictResolutionIfNeeded(res, queryClient, op.method, op.path, op.body);
            if (res.status === 499) {
              syncAborted = true;
              break;
            }
            const parsed = await parseHttpSyncResponse(res, op.path);
            const reviewBase = pathWithoutQuery(op.path);
            if (
              op.method.toUpperCase() === "POST" &&
              reviewBase === "/api/tasks/review/apply" &&
              parsed &&
              typeof parsed === "object"
            ) {
              const failedIdx = reviewApplyFailedActionIndices(parsed);
              if (failedIdx.length > 0) {
                const bodyObj = op.body as Record<string, unknown> | null | undefined;
                const actions = Array.isArray(bodyObj?.actions) ? (bodyObj.actions as unknown[]) : [];
                const resultsArr = (parsed as { results?: unknown[] }).results;
                const hasConflict = failedIdx.some((i) => {
                  const r = Array.isArray(resultsArr) ? resultsArr[i] : undefined;
                  return (
                    r &&
                    typeof r === "object" &&
                    reviewApplyFailureIsConflict(r as { error?: string })
                  );
                });
                const transientRetryIndices = failedIdx.filter((i) => {
                  const r = Array.isArray(resultsArr) ? resultsArr[i] : undefined;
                  return (
                    r &&
                    typeof r === "object" &&
                    reviewApplyFailureIsTransientRetry(r as { error?: string; retryable?: boolean })
                  );
                });
                shouldRemoveOp = false;
                if (hasConflict) {
                  drainStoppedEarly = true;
                  syncAborted = true;
                }
                if (transientRetryIndices.length > 0 && !hasConflict) {
                  removeOfflineOp(op.opId);
                  const retryActions = transientRetryIndices
                    .map((i) => actions[i])
                    .filter((x) => x !== undefined && x !== null);
                  if (retryActions.length > 0) {
                    const retryBody =
                      bodyObj && typeof bodyObj === "object" && !Array.isArray(bodyObj)
                        ? { ...bodyObj, actions: retryActions }
                        : { actions: retryActions };
                    assertEnqueueOk(
                      enqueueHttpMutation(op.method, op.path, retryBody),
                      "enqueueHttpMutation reviewApplyRetry",
                    );
                  }
                } else if (!hasConflict) {
                  removeOfflineOp(op.opId);
                }
                await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
                await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
                break;
              }
            }
            if (op.path.startsWith("/api/tasks")) {
              await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
              await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
            }
            break;
          }
            default:
              break;
          }
          if (syncAborted) {
            drainStoppedEarly = true;
            break;
          }
          if (shouldRemoveOp) removeOfflineOp(op.opId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[offline-task-queue] drain failed", { ...opDrainMeta(op), error: message, err });
          drainStoppedEarly = true;
          break;
        }
        ops = peekOfflineQueue();
      }

    if (!drainStoppedEarly && peekOfflineQueue().length === 0) {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
    }
    } finally {
      endOfflineQueueDrainScope();
    }
  });
}

