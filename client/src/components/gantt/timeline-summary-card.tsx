import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

export interface TimelineSummaryCardProps {
  blockerCount: number;
  milestoneCount: number;
  hardDeadlineCount: number;
  onOpenWorkspace: () => void;
}

export function TimelineSummaryCard({
  blockerCount,
  milestoneCount,
  hardDeadlineCount,
  onOpenWorkspace,
}: TimelineSummaryCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/5 dark:bg-black/20 p-4 shadow-inner flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="rounded-lg bg-indigo-500/15 p-2 border border-indigo-400/20 shrink-0">
          <BarChart3 className="h-6 w-6 text-indigo-400" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Timeline</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {blockerCount} blocker{blockerCount !== 1 ? "s" : ""} · {hardDeadlineCount} hard deadline
            {hardDeadlineCount !== 1 ? "s" : ""} · {milestoneCount} milestone{milestoneCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <Button type="button" size="sm" className="shrink-0 w-full sm:w-auto" onClick={onOpenWorkspace}>
        Open Timeline Workspace
      </Button>
    </div>
  );
}

/** Planner AI card counts — best-effort until `deadline_type` / milestone flag exists on tasks. */
export function computeTimelineSummaryCounts(tasks: import("@shared/schema").Task[]): {
  blockerCount: number;
  milestoneCount: number;
  hardDeadlineCount: number;
} {
  const byId = new Map(tasks.map((t) => [t.id, t] as const));
  let blockerCount = 0;
  for (const t of tasks) {
    if (t.status === "completed") continue;
    let blocked = false;
    for (const pid of t.dependsOn ?? []) {
      const p = byId.get(pid);
      if (p && p.status !== "completed") {
        blocked = true;
        break;
      }
    }
    if (blocked) blockerCount += 1;
  }
  const milestoneCount = tasks.filter(
    (t) => t.classification === "Milestone" || /\bmilestone\b/i.test(t.activity),
  ).length;
  const hardDeadlineCount = tasks.filter((t) => {
    if (t.priority === "Highest") return true;
    return /\b(audit|exam|deadline|pearson|pmi|vue)\b/i.test(`${t.activity} ${t.notes ?? ""}`);
  }).length;
  return { blockerCount, milestoneCount, hardDeadlineCount };
}
