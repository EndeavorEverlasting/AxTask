import { describe, expect, it } from "vitest";
import type { Task } from "@shared/schema";
import {
  buildLocalMarkovInsights,
  buildOrderedCompletionStates,
  mergePlannerInsights,
  toMarkovState,
} from "./local-markov-predictions";
import type { LocalCompletionEvent } from "./local-prediction-ledger";

function makeTask(p: Partial<Task> & Pick<Task, "id" | "activity" | "classification" | "status" | "date">): Task {
  return {
    userId: "u1",
    time: null,
    notes: "",
    urgency: null,
    impact: null,
    effort: null,
    prerequisites: "",
    recurrence: "none",
    priority: "Low",
    priorityScore: 0,
    classificationAssociations: null,
    isRepeated: false,
    sortOrder: 0,
    visibility: "private",
    communityShowNotes: false,
    startDate: null,
    endDate: null,
    durationMinutes: null,
    dependsOn: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...p,
  } as Task;
}

describe("local-markov-predictions", () => {
  it("toMarkovState encodes place bucket", () => {
    expect(toMarkovState("Work", null)).toContain("place:__none__");
    expect(toMarkovState("Work", "p1")).toBe("Work::place:p1");
  });

  it("buildOrderedCompletionStates orders backfill before ledger tail", () => {
    const ledger: LocalCompletionEvent[] = [
      {
        id: "1",
        userId: "u1",
        at: 2_000,
        taskId: "t2",
        classification: "B",
        placeId: null,
      },
    ];
    const tasks: Task[] = [
      makeTask({
        id: "t0",
        activity: "a0",
        classification: "A",
        status: "completed",
        date: "2020-01-01",
        updatedAt: new Date(1_000),
      }),
    ];
    const seq = buildOrderedCompletionStates("u1", ledger, tasks);
    expect(seq[0]).toBe(toMarkovState("A", null));
    expect(seq[1]).toBe(toMarkovState("B", null));
  });

  it("mergePlannerInsights prefers local task ids", () => {
    const local = [{ taskIds: ["a"], x: 1 }];
    const server = [{ taskIds: ["a"], y: 2 }, { taskIds: ["b"], y: 3 }];
    const m = mergePlannerInsights(local, server, 10);
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual(local[0]);
    expect((m[1] as { taskIds?: string[] }).taskIds).toEqual(["b"]);
  });

  it("buildLocalMarkovInsights returns suggestions when chain supports transitions", () => {
    const ledger: LocalCompletionEvent[] = [
      { id: "1", userId: "u1", at: 1, taskId: "c1", classification: "Alpha", placeId: null },
      { id: "2", userId: "u1", at: 2, taskId: "c2", classification: "Beta", placeId: null },
    ];
    const pending = [
      makeTask({
        id: "p1",
        activity: "Do beta work",
        classification: "Beta",
        status: "pending",
        date: "2026-04-24",
      }),
    ];
    const insights = buildLocalMarkovInsights("u1", pending, [], ledger, { limit: 3 });
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0]!.type).toBe("markov_local");
    expect(insights[0]!.confidence).toBeGreaterThanOrEqual(0);
    expect(insights[0]!.confidence).toBeLessThanOrEqual(100);
  });
});
