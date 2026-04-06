import type { Task } from "@shared/schema";

export type ConflictChoice = "server" | "local" | "both";

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

function dispatchActive(): void {
  if (active) return;
  const next = conflictQueue.shift();
  if (!next) return;
  active = next;
  window.dispatchEvent(new CustomEvent(TASK_CONFLICT_EVENT, { detail: next.detail }));
}

export function openConflictDialog(detail: TaskConflictDetail): Promise<ConflictChoice> {
  return new Promise((resolve) => {
    conflictQueue.push({ resolve, detail });
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
  const { resolve } = active;
  active = null;
  resolve("server");
  dispatchActive();
}
