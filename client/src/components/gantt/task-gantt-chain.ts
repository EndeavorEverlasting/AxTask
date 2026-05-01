import type { Task } from "@shared/schema";

/** Predecessors (transitive) ∪ successors (transitive) ∪ `taskId`. */
export function computeDependencyChain(taskId: string, tasks: Task[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t] as const));
  const chain = new Set<string>();

  function addPreds(id: string) {
    const t = byId.get(id);
    if (!t) return;
    for (const p of t.dependsOn ?? []) {
      if (!byId.has(p)) continue;
      if (chain.has(p)) continue;
      chain.add(p);
      addPreds(p);
    }
  }

  addPreds(taskId);
  chain.add(taskId);

  const queue = [taskId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const t of tasks) {
      if ((t.dependsOn ?? []).includes(cur) && !chain.has(t.id)) {
        chain.add(t.id);
        queue.push(t.id);
      }
    }
  }

  return chain;
}
