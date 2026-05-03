import type { Task } from "./schema";

export type TaskConflictPayload = {
  task_conflict?: boolean;
  serverTask: Task;
};

export function isTaskConflictPayload(x: unknown): x is TaskConflictPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (!o.serverTask || typeof o.serverTask !== "object") return false;
  return o.task_conflict === true || typeof (o.serverTask as { id?: unknown }).id === "string";
}
