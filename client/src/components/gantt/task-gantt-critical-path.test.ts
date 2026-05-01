import { describe, expect, it } from "vitest";
import type { Task } from "@shared/schema";
import { computeCriticalTaskIds } from "./task-gantt-critical-path";

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
    deadlineType: null,
    ...partial,
  } as Task;
}

describe("computeCriticalTaskIds", () => {
  it("returns a chain along dependencies", () => {
    const a = mkTask({
      id: "a",
      activity: "A",
      date: "2026-05-01",
      startDate: "2026-05-01",
      endDate: "2026-05-02",
    });
    const b = mkTask({
      id: "b",
      activity: "B",
      date: "2026-05-03",
      startDate: "2026-05-03",
      endDate: "2026-05-04",
      dependsOn: ["a"],
    });
    const c = mkTask({
      id: "c",
      activity: "C",
      date: "2026-05-05",
      startDate: "2026-05-05",
      endDate: "2026-05-06",
      dependsOn: ["b"],
    });
    const ids = computeCriticalTaskIds([a, b, c]);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(true);
  });
});
