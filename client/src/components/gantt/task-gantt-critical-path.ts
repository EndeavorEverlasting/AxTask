import type { Task } from "@shared/schema";
import { deriveTaskRange } from "@/components/task-gantt";

/**
 * Longest-path critical chain among tasks (dependsOn edges).
 * TODO: replace with shared/critical-path.ts when conversion-artifacts-pmp branch lands.
 */
export function computeCriticalTaskIds(tasks: Task[]): Set<string> {
  const ids = new Set(tasks.map((t) => t.id));
  const taskById = new Map(tasks.map((t) => [t.id, t] as const));

  function durationDays(task: Task): number {
    const r = deriveTaskRange(task);
    if (!r) return 1;
    const ms = Math.max(r.end.getTime() - r.start.getTime(), 60_000);
    return Math.max(1, ms / (24 * 60 * 60 * 1000));
  }

  const predsOf = new Map<string, string[]>();
  const succsOf = new Map<string, string[]>();
  for (const t of tasks) {
    predsOf.set(t.id, []);
    succsOf.set(t.id, []);
  }
  for (const t of tasks) {
    for (const pid of t.dependsOn ?? []) {
      if (!ids.has(pid)) continue;
      predsOf.get(t.id)!.push(pid);
      succsOf.get(pid)!.push(t.id);
    }
  }

  const memo = new Map<string, number>();
  /** Longest path length ending at `id`, including `id`'s duration. */
  function longestPathTo(id: string): number {
    if (memo.has(id)) return memo.get(id)!;
    const preds = predsOf.get(id) ?? [];
    let bestBase = 0;
    for (const p of preds) {
      bestBase = Math.max(bestBase, longestPathTo(p));
    }
    const task = taskById.get(id);
    const len = bestBase + (task ? durationDays(task) : 0);
    memo.set(id, len);
    return len;
  }

  let terminal = tasks[0]?.id;
  let bestScore = -Infinity;
  for (const t of tasks) {
    const score = longestPathTo(t.id);
    if (score > bestScore) {
      bestScore = score;
      terminal = t.id;
    }
  }

  const critical = new Set<string>();
  if (!terminal) return critical;

  let cur: string | undefined = terminal;
  while (cur) {
    critical.add(cur);
    const incomingPreds: string[] = predsOf.get(cur) ?? [];
    if (incomingPreds.length === 0) break;
    let bestPred: string = incomingPreds[0]!;
    let bestLen = -Infinity;
    for (const p of incomingPreds) {
      const len = longestPathTo(p);
      if (len > bestLen) {
        bestLen = len;
        bestPred = p;
      }
    }
    cur = bestPred;
  }

  return critical;
}
