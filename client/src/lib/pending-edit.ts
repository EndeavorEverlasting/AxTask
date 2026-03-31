import type { Task } from "@shared/schema";

let pendingEditTask: Task | null = null;
let pendingVersion = 0;
const listeners: Array<() => void> = [];

export function setPendingEditTask(task: Task) {
  pendingEditTask = task;
  pendingVersion++;
  listeners.forEach(fn => fn());
}

export function consumePendingEditTask(): Task | null {
  const t = pendingEditTask;
  pendingEditTask = null;
  return t;
}

export function subscribePendingEdit(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function getPendingVersion(): number {
  return pendingVersion;
}
