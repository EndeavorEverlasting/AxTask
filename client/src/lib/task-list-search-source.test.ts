import { describe, expect, it } from "vitest";
import type { Task } from "@shared/schema";
import { resolveTaskListSearchSource } from "./task-list-search-source";

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "1",
    userId: "u",
    date: "2026-01-01",
    activity: "Alpha",
    notes: "",
    status: "pending",
    priority: "Medium",
    priorityScore: 1,
    classification: "General",
    recurrence: "none",
    visibility: "private",
    communityShowNotes: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as Task;

describe("resolveTaskListSearchSource", () => {
  it("uses full list with local search when offline", () => {
    const all = [task({ id: "a", activity: "Find me" }), task({ id: "b", activity: "Other" })];
    const r = resolveTaskListSearchSource({
      browserOnline: false,
      debouncedQuery: "find",
      allTasks: all,
      searchResults: [all[0]!],
    });
    expect(r.baseTasks).toBe(all);
    expect(r.applyLocalSearch).toBe(true);
    expect(r.serverSearchActive).toBe(false);
  });

  it("uses full list with local search when query is short", () => {
    const all = [task()];
    const r = resolveTaskListSearchSource({
      browserOnline: true,
      debouncedQuery: "x",
      allTasks: all,
      searchResults: [],
    });
    expect(r.baseTasks).toBe(all);
    expect(r.applyLocalSearch).toBe(true);
    expect(r.serverSearchActive).toBe(false);
  });

  it("uses server results when online, query long enough, and results are defined", () => {
    const all = [task({ id: "a" }), task({ id: "b" })];
    const subset = [all[0]!];
    const r = resolveTaskListSearchSource({
      browserOnline: true,
      debouncedQuery: "ab",
      allTasks: all,
      searchResults: subset,
    });
    expect(r.baseTasks).toEqual(subset);
    expect(r.applyLocalSearch).toBe(false);
    expect(r.serverSearchActive).toBe(true);
  });

  it("falls back to full list with local search while server results are undefined", () => {
    const all = [task({ activity: "local only" })];
    const r = resolveTaskListSearchSource({
      browserOnline: true,
      debouncedQuery: "xx",
      allTasks: all,
      searchResults: undefined,
    });
    expect(r.baseTasks).toBe(all);
    expect(r.applyLocalSearch).toBe(true);
    expect(r.serverSearchActive).toBe(false);
  });
});
