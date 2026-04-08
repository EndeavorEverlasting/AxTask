import type { Task } from "@shared/schema";

export type ConflictChoice = "server" | "local" | "both" | "aborted";

export type TaskConflictDetail = {
  kind: "update" | "delete";
  taskId: string;
  serverTask: Task;
  /** Local intent (update patch or null for delete). */
  localPatch?: Record<string, unknown>;
  baseUpdatedAt: string | null;
};

export const TASK_CONFLICT_EVENT = "axtask-task-conflict";

type Queued = {
  resolve: (c: ConflictChoice) => void;
  detail: TaskConflictDetail;
};

let active: Queued | null = null;
const conflictQueue: Queued[] = [];

/** Per-entry: abort listener removal (signal may outlive the promise). */
const entryAbortCleanups = new WeakMap<Queued, () => void>();

function dispatchActive(): void {
  if (active) return;
  const next = conflictQueue.shift();
  if (!next) return;
  active = next;
  window.dispatchEvent(new CustomEvent(TASK_CONFLICT_EVENT, { detail: next.detail }));
}

export function openConflictDialog(
  detail: TaskConflictDetail,
  options?: { signal?: AbortSignal },
): Promise<ConflictChoice> {
  return new Promise((resolve) => {
    const signal = options?.signal;
    let settled = false;
    let entry: Queued;

    const cleanAbort = () => {
      const fn = entryAbortCleanups.get(entry);
      if (fn) {
        entryAbortCleanups.delete(entry);
        fn();
      }
    };

    const finish = (c: ConflictChoice) => {
      if (settled) return;
      settled = true;
      cleanAbort();
      resolve(c);
    };

    entry = { resolve: finish, detail };

    const onAbort = () => {
      if (settled) return;
      const wasActive = active === entry;
      const idx = conflictQueue.indexOf(entry);
      if (idx >= 0) conflictQueue.splice(idx, 1);
      if (wasActive) active = null;
      finish("aborted");
      if (wasActive) dispatchActive();
    };

    if (signal) {
      if (signal.aborted) {
        finish("aborted");
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      entryAbortCleanups.set(entry, () => signal.removeEventListener("abort", onAbort));
    }

    conflictQueue.push(entry);
    dispatchActive();
  });
}

export function getPendingConflictDetail(): TaskConflictDetail | null {
  return active?.detail ?? null;
}

export function submitConflictChoice(choice: ConflictChoice): void {
  if (!active) return;
  const { resolve } = active;
  active = null;
  resolve(choice);
  dispatchActive();
}

export function abortConflictDialog(): void {
  if (!active) return;
  const entry = active;
  const { resolve } = entry;
  const fn = entryAbortCleanups.get(entry);
  if (fn) {
    entryAbortCleanups.delete(entry);
    fn();
  }
  active = null;
  resolve("aborted");
  dispatchActive();
}
