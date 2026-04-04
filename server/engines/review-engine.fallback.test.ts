import { describe, it, expect } from "vitest";
import type { Task } from "@shared/schema";
import { processTaskReview } from "./review-engine";

const now = new Date("2026-04-01T12:00:00Z");

function makeTask(partial: Partial<Task> & Pick<Task, "id" | "activity">): Task {
  return {
    userId: "u1",
    date: "2026-04-02",
    time: null,
    notes: "",
    urgency: 1,
    impact: 1,
    effort: 1,
    prerequisites: "",
    recurrence: "none",
    priority: "Medium",
    priorityScore: 50,
    classification: "General",
    status: "pending",
    isRepeated: false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("processTaskReview fallback completion", () => {
  it("does not emit complete actions from bare task-like fragments without a completion verb", () => {
    const tasks = [makeTask({ id: "t1", activity: "Buy groceries" })];
    const result = processTaskReview("groceries", tasks, now);
    expect(result.actions.filter((a) => a.type === "complete")).toHaveLength(0);
  });

  it("still matches completion via explicit verb + task reference", () => {
    const tasks = [makeTask({ id: "t1", activity: "Buy groceries" })];
    const result = processTaskReview("I finished groceries", tasks, now);
    expect(result.actions.some((a) => a.type === "complete" && a.taskId === "t1")).toBe(true);
  });
});
