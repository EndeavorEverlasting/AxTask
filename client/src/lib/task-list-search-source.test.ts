import { describe, expect, it } from "vitest";
import { resolveTaskListSearchSource } from "./task-list-search-source";
import type { Task } from "@shared/schema";

const mkTask = (id: string): Task =>
  ({
    id,
    userId: "u1",
    date: null,
    time: null,
    activity: `Task ${id}`,
    notes: null,
    urgency: 5,
    impact: 5,
    effort: 5,
    priority: "Medium",
    priorityScore: 50,
    status: "pending",
    classification: "Administrative",
    classificationAssociations: [{ label: "Administrative", confidence: 1 }],
    isRepeated: false,
    prerequisites: null,
    recurrence: null,
    sortOrder: null,
    visibility: "private",
    communityApprovedAt: null,
    communityTaskId: null,
    communityShowNotes: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Task;

describe("resolveTaskListSearchSource", () => {
  it("uses local tasks for short query/offline", () => {
    const allTasks = [mkTask("a"), mkTask("b")];
    const out = resolveTaskListSearchSource({
      browserOnline: false,
      debouncedQuery: "abc",
      allTasks,
      searchResults: [mkTask("x")],
    });
    expect(out.baseTasks).toEqual(allTasks);
    expect(out.applyLocalSearch).toBe(true);
    expect(out.serverSearchActive).toBe(false);
  });

  it("uses server results when available", () => {
    const allTasks = [mkTask("a")];
    const searchResults = [mkTask("x"), mkTask("y")];
    const out = resolveTaskListSearchSource({
      browserOnline: true,
      debouncedQuery: "do",
      allTasks,
      searchResults,
    });
    expect(out.baseTasks).toEqual(searchResults);
    expect(out.applyLocalSearch).toBe(false);
    expect(out.serverSearchActive).toBe(true);
  });
});

