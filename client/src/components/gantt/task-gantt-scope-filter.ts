import type { Task } from "@shared/schema";
import { deriveTaskRange } from "@/components/task-gantt";
import type { GanttTimelineScope } from "./task-gantt-types";

const MS_DAY = 24 * 60 * 60 * 1000;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  return new Date(s.getTime() + 7 * MS_DAY - 1);
}

export function isTaskBlockedByIncompletePred(t: Task, tasks: Task[]): boolean {
  const byId = new Map(tasks.map((x) => [x.id, x] as const));
  for (const pid of t.dependsOn ?? []) {
    const p = byId.get(pid);
    if (p && p.status !== "completed") return true;
  }
  return false;
}

/** Heuristic until `deadline_type` exists on tasks. */
function looksLikeHardDeadline(t: Task): boolean {
  if (t.priority === "Highest") return true;
  const blob = `${t.activity} ${t.notes ?? ""}`.toLowerCase();
  return /\b(audit|exam|deadline|vue|pearson|pmi)\b/.test(blob);
}

/**
 * Narrows tasks for the timeline workspace scope control.
 * Bundle membership is applied upstream (e.g. `planner-timeline` filters tasks before
 * passing them here) when `?bundle=` is present.
 */
export function filterTasksForTimelineScope(
  tasks: Task[],
  scope: GanttTimelineScope,
  now: Date = new Date(),
): Task[] {
  switch (scope) {
    case "all":
      return tasks;
    case "this-week": {
      const ws = startOfWeek(now);
      const we = endOfWeek(now);
      return tasks.filter((t) => {
        const r = deriveTaskRange(t);
        if (!r) return false;
        return r.start <= we && r.end >= ws;
      });
    }
    case "next-21-days": {
      const end = new Date(now.getTime() + 21 * MS_DAY);
      return tasks.filter((t) => {
        const r = deriveTaskRange(t);
        if (!r) return false;
        return r.start <= end && r.end >= now;
      });
    }
    case "certification":
      return tasks.filter((t) => t.classification === "Certification");
    case "pmp-sprint": {
      return tasks.filter((t) => {
        const blob = `${t.activity} ${t.notes ?? ""}`.toLowerCase();
        return blob.includes("pmp") || blob.includes("pmi") || blob.includes("pearson vue");
      });
    }
    case "blocked":
      return tasks.filter((t) => isTaskBlockedByIncompletePred(t, tasks));
    case "hard-deadlines":
      return tasks.filter((t) => looksLikeHardDeadline(t));
    default:
      return tasks;
  }
}
