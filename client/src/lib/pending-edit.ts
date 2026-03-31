let pendingEditTask: unknown = null;

export function setPendingEditTask(task: unknown) {
  pendingEditTask = task;
}

export function consumePendingEditTask(): unknown {
  const t = pendingEditTask;
  pendingEditTask = null;
  return t;
}
