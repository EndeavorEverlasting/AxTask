// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Task } from "@shared/schema";
import {
  buildDailyProductivityReport,
  buildDailyProductivityReportMarkdown,
  completionDayKey,
  goalHighlightReasons,
} from "./daily-productivity-report";

function task(partial: Partial<Task> & Pick<Task, "id" | "activity" | "date" | "status">): Task {
  return {
    userId: "u1",
    time: null,
    notes: "",
    urgency: null,
    impact: null,
    effort: null,
    prerequisites: "",
    recurrence: "none",
    priority: "Medium",
    priorityScore: 20,
    classification: "General",
    isRepeated: false,
    sortOrder: 0,
    visibility: "private",
    communityShowNotes: false,
    startDate: null,
    endDate: null,
    durationMinutes: null,
    dependsOn: null,
    classificationAssociations: null,
    createdAt: new Date("2026-01-01T12:00:00Z"),
    updatedAt: new Date("2026-01-10T12:00:00Z"),
    ...partial,
  } as Task;
}

describe("daily-productivity-report", () => {
  it("buckets completions by updatedAt day", () => {
    const tasks = [
      task({
        id: "a",
        activity: "Done A",
        date: "2026-01-09",
        status: "completed",
        updatedAt: new Date("2026-01-10T15:00:00Z"),
      }),
      task({
        id: "b",
        activity: "Done B",
        date: "2026-01-09",
        status: "completed",
        updatedAt: new Date("2026-01-11T08:00:00Z"),
      }),
    ];
    const r = buildDailyProductivityReport(tasks, "2026-01-10", "2026-01-11");
    expect(r.summary.totalCompletedInRange).toBe(2);
    const d10 = r.days.find((d) => d.date === "2026-01-10");
    const d11 = r.days.find((d) => d.date === "2026-01-11");
    expect(d10?.completedActivities).toContain("Done A");
    expect(d11?.completedActivities).toContain("Done B");
  });

  it("lists open goals and highlight heuristics", () => {
    const tasks = [
      task({
        id: "o1",
        activity: "Simple open",
        date: "2026-01-12",
        status: "pending",
      }),
      task({
        id: "o2",
        activity: "Heavy prep",
        date: "2026-01-12",
        status: "in-progress",
        prerequisites: "x".repeat(130),
        dependsOn: ["a", "b"],
      }),
    ];
    expect(goalHighlightReasons(tasks[1])).toContain("heavy_prereqs");
    const r = buildDailyProductivityReport(tasks, "2026-01-12", "2026-01-12");
    expect(r.summary.openGoalCount).toBe(2);
    expect(r.summary.highlightedGoalCount).toBeGreaterThanOrEqual(1);
    const md = buildDailyProductivityReportMarkdown(r, "2026-01-12T00:00:00.000Z");
    expect(md).toContain("Heavy prep");
    expect(md).toContain("Completions by day");
  });

  it("completionDayKey returns null for non-completed", () => {
    const t = task({
      id: "p",
      activity: "Pending",
      date: "2026-01-01",
      status: "pending",
      updatedAt: new Date("2026-01-05T00:00:00Z"),
    });
    expect(completionDayKey(t)).toBeNull();
  });
});
