import type { Task } from "@shared/schema";

export const GOAL_OPEN_STATUSES = new Set(["pending", "in-progress"]);

/** Max open tasks listed as goals in Markdown (full count still in summary). */
export const DAILY_REPORT_MAX_GOAL_LINES = 100;

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Completion calendar day from DB timestamp (UTC date). */
export function completionDayKey(task: Task): string | null {
  if (task.status !== "completed") return null;
  const raw = task.updatedAt ?? task.createdAt;
  if (!raw) return null;
  return toIsoDate(new Date(raw));
}

export type GoalHighlightReason = "repeating" | "long_duration" | "heavy_prereqs";

export function goalHighlightReasons(task: Task): GoalHighlightReason[] {
  const reasons: GoalHighlightReason[] = [];
  if (task.isRepeated || (task.recurrence && task.recurrence !== "none")) {
    reasons.push("repeating");
  }
  if ((task.durationMinutes ?? 0) >= 90) {
    reasons.push("long_duration");
  }
  const depCount = Array.isArray(task.dependsOn) ? task.dependsOn.length : 0;
  const prereqLen = (task.prerequisites ?? "").trim().length;
  if (depCount >= 2 || prereqLen >= 120) {
    reasons.push("heavy_prereqs");
  }
  return reasons;
}

export function isOpenGoalTask(task: Task): boolean {
  return GOAL_OPEN_STATUSES.has(task.status);
}

export type DailyRow = {
  date: string;
  completedActivities: string[];
};

export type OpenGoalLine = {
  activity: string;
  status: string;
  highlights: GoalHighlightReason[];
};

export type DailyProductivityReport = {
  range: { from: string; to: string };
  days: DailyRow[];
  openGoals: OpenGoalLine[];
  summary: {
    totalCompletedInRange: number;
    openGoalCount: number;
    highlightedGoalCount: number;
  };
};

function clampRange(from: string, to: string): { from: string; to: string } {
  let a = from;
  let b = to;
  if (a > b) [a, b] = [b, a];
  return { from: a, to: b };
}

function enumerateDates(from: string, to: string): string[] {
  const { from: f, to: t } = clampRange(from, to);
  const start = Date.parse(`${f}T12:00:00`);
  const end = Date.parse(`${t}T12:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const out: string[] = [];
  for (let cur = start; cur <= end; cur += 86400000) {
    out.push(toIsoDate(new Date(cur)));
  }
  return out;
}

/**
 * Builds a per-day completion list plus open "goals" (incomplete tasks).
 * Goal highlights: repeating work, long planned duration, heavy prerequisites / dependencies.
 */
export function buildDailyProductivityReport(tasks: Task[], from: string, to: string): DailyProductivityReport {
  const { from: f, to: t } = clampRange(from, to);
  const dates = enumerateDates(f, t);
  const dateSet = new Set(dates);

  const byDay = new Map<string, string[]>();
  for (const d of dates) byDay.set(d, []);

  let totalCompletedInRange = 0;
  for (const task of tasks) {
    const day = completionDayKey(task);
    if (!day || !dateSet.has(day)) continue;
    const list = byDay.get(day)!;
    list.push(task.activity);
    totalCompletedInRange += 1;
  }

  const days: DailyRow[] = dates.map((date) => ({
    date,
    completedActivities: byDay.get(date) ?? [],
  }));

  const openTasks = tasks.filter(isOpenGoalTask);
  const openGoals: OpenGoalLine[] = openTasks
    .map((task) => ({
      activity: task.activity,
      status: task.status,
      highlights: goalHighlightReasons(task),
    }))
    .sort((a, b) => {
      const ha = a.highlights.length;
      const hb = b.highlights.length;
      if (ha !== hb) return hb - ha;
      return a.activity.localeCompare(b.activity);
    })
    .slice(0, DAILY_REPORT_MAX_GOAL_LINES);

  const highlightedGoalCount = openTasks.filter((t) => goalHighlightReasons(t).length > 0).length;

  return {
    range: { from: f, to: t },
    days,
    openGoals,
    summary: {
      totalCompletedInRange,
      openGoalCount: openTasks.length,
      highlightedGoalCount,
    },
  };
}

export function buildDailyProductivityReportMarkdown(report: DailyProductivityReport, generatedAtIso: string): string {
  const lines: string[] = [
    "# AxTask daily productivity report",
    "",
    `- Generated: ${generatedAtIso}`,
    `- Range: **${report.range.from}** → **${report.range.to}**`,
    `- Tasks completed in range: **${report.summary.totalCompletedInRange}**`,
    `- Open goals (incomplete tasks): **${report.summary.openGoalCount}** (${report.summary.highlightedGoalCount} with repeating / long-duration / heavy-prereq signals)`,
    "",
    "## Completions by day",
    "",
  ];

  for (const row of report.days) {
    lines.push(`### ${row.date}`);
    if (row.completedActivities.length === 0) {
      lines.push("_No completions recorded._");
    } else {
      for (const act of row.completedActivities) {
        lines.push(`- ${act.replace(/\n/g, " ")}`);
      }
    }
    lines.push("");
  }

  lines.push("## Open goals (incomplete tasks)", "");
  if (report.openGoals.length === 0) {
    lines.push("_None — inbox clear or all tasks completed._");
  } else {
    for (const g of report.openGoals) {
      const tag =
        g.highlights.length > 0
          ? ` _(${g.highlights.join(", ")}, status: ${g.status})_`
          : ` _(status: ${g.status})_`;
      lines.push(`- **${g.activity.replace(/\n/g, " ")}**${tag}`);
    }
    if (report.summary.openGoalCount > report.openGoals.length) {
      lines.push("");
      lines.push(
        `_…and ${report.summary.openGoalCount - report.openGoals.length} more open tasks not listed (cap ${DAILY_REPORT_MAX_GOAL_LINES})._`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}
