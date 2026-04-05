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

type Pending = {
  resolve: (c: ConflictChoice) => void;
  detail: TaskConflictDetail;
};

let pending: Pending | null = null;

export function openConflictDialog(detail: TaskConflictDetail): Promise<ConflictChoice> {
  if (pending) {
    pending.resolve("server");
    pending = null;
  }
  return new Promise((resolve) => {
    pending = { resolve, detail };
    window.dispatchEvent(new CustomEvent(TASK_CONFLICT_EVENT, { detail }));
  });
}

export function getPendingConflictDetail(): TaskConflictDetail | null {
  return pending?.detail ?? null;
}

export function submitConflictChoice(choice: ConflictChoice): void {
  pending?.resolve(choice);
  pending = null;
}

export function abortConflictDialog(): void {
  if (pending) {
    pending.resolve("server");
    pending = null;
  }
}
