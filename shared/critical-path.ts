import type { Task } from "./schema";

const CRITICAL_DEADLINE_TYPES = new Set(["hard", "audit-risk", "exam"]);

function parseToDate(raw: string | null | undefined, fallbackTime?: string | null): Date | null {
  if (!raw) return null;
  const hasTime = /\d{2}:\d{2}/.test(raw);
  const withTime = hasTime
    ? raw
    : `${raw}T${fallbackTime && /\d{2}:\d{2}/.test(fallbackTime) ? fallbackTime : "09:00"}:00`;
  const d = new Date(withTime);
  return Number.isFinite(d.getTime()) ? d : null;
}

function durationMs(task: Task): number {
  const start =
    parseToDate(task.startDate ?? null, task.time) ?? parseToDate(task.date, task.time);
  if (!start) return 24 * 60 * 60_000;
  const explicitEnd = parseToDate(task.endDate ?? null, null);
  const minutes = task.durationMinutes ?? 60;
  const end = explicitEnd ?? new Date(start.getTime() + minutes * 60_000);
  return Math.max(20 * 60_000, end.getTime() - start.getTime());
}

/**
 * Tasks on the longest dependency chain leading to `terminalId`, plus any task whose
 * `deadlineType` is hard / audit-risk / exam.
 */
export function computeCriticalPathIds(tasks: Task[], terminalId: string): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t] as const));
  if (!byId.has(terminalId)) return new Set();

  const memo = new Map<string, number>();
  const nextOnLongest = new Map<string, string | null>();

  function longestInto(id: string): number {
    if (memo.has(id)) return memo.get(id)!;
    const task = byId.get(id);
    if (!task) {
      memo.set(id, 0);
      return 0;
    }
    const preds = Array.isArray(task.dependsOn) ? task.dependsOn.filter((p) => byId.has(p)) : [];
    if (preds.length === 0) {
      const dur = durationMs(task);
      memo.set(id, dur);
      nextOnLongest.set(id, null);
      return dur;
    }
    let best = -Infinity;
    let bestP: string | null = null;
    for (const p of preds) {
      const cand = longestInto(p) + durationMs(task);
      if (cand > best) {
        best = cand;
        bestP = p;
      }
    }
    memo.set(id, best);
    nextOnLongest.set(id, bestP);
    return best;
  }

  longestInto(terminalId);
  const path = new Set<string>();
  let cur: string | null = terminalId;
  while (cur) {
    path.add(cur);
    cur = nextOnLongest.get(cur) ?? null;
  }

  for (const t of tasks) {
    const dt = t.deadlineType;
    if (dt && CRITICAL_DEADLINE_TYPES.has(dt)) path.add(t.id);
  }
  return path;
}
