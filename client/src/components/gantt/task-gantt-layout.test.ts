import { describe, expect, it } from "vitest";
import type { Task } from "@shared/schema";
import { buildGanttLayout, daysBetween } from "./task-gantt-layout";

function mkTask(partial: Partial<Task> & Pick<Task, "id" | "activity" | "date">): Task {
  return {
    userId: "u1",
    time: "",
    notes: "",
    prerequisites: "",
    recurrence: "none",
    priority: "Medium",
    priorityScore: 50,
    classification: "General",
    status: "pending",
    visibility: "private",
    communityShowNotes: false,
    dependsOn: null,
    ...partial,
  } as Task;
}

describe("daysBetween", () => {
  it("returns fractional days", () => {
    const a = new Date("2026-05-01T00:00:00Z");
    const b = new Date("2026-05-03T12:00:00Z");
    expect(daysBetween(a, b)).toBeCloseTo(2.5, 5);
  });
});

describe("buildGanttLayout", () => {
  it("clamps bar width to minimum node width", () => {
    const t = mkTask({
      id: "a",
      activity: "Short",
      date: "2026-05-01",
      startDate: "2026-05-01",
      endDate: "2026-05-01T10:00:00",
      durationMinutes: 20,
    });
    const res = buildGanttLayout({
      tasks: [t],
      mode: "readable",
      groupBy: "none",
      unlocked: false,
      rangeDays: 21,
    });
    expect(res.nodes).toHaveLength(1);
    const w = Number(res.nodes[0]?.style?.width ?? 0);
    expect(w).toBeGreaterThanOrEqual(140);
  });

  it("stacks tasks in one lane when unlocked is false", () => {
    const tasks = [
      mkTask({
        id: "1",
        activity: "A",
        date: "2026-05-01",
        startDate: "2026-05-01",
        endDate: "2026-05-02",
      }),
      mkTask({
        id: "2",
        activity: "B",
        date: "2026-05-03",
        startDate: "2026-05-03",
        endDate: "2026-05-04",
      }),
    ];
    const res = buildGanttLayout({
      tasks,
      mode: "compact",
      groupBy: "classification",
      unlocked: false,
      rangeDays: 21,
    });
    expect(res.nodes).toHaveLength(2);
    expect(res.nodes[0]?.position.y).not.toBe(res.nodes[1]?.position.y);
  });

  it("creates dependency edge when predecessor is laid out", () => {
    const pred = mkTask({
      id: "p",
      activity: "Pred",
      date: "2026-05-01",
      startDate: "2026-05-01",
      endDate: "2026-05-02",
    });
    const succ = mkTask({
      id: "s",
      activity: "Succ",
      date: "2026-05-03",
      startDate: "2026-05-03",
      endDate: "2026-05-04",
      dependsOn: ["p"],
    });
    const res = buildGanttLayout({
      tasks: [pred, succ],
      mode: "readable",
      groupBy: "none",
      unlocked: false,
      rangeDays: 21,
    });
    expect(res.edges.some((e) => e.source === "p" && e.target === "s")).toBe(true);
  });
});
