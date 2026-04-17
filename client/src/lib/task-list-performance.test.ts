import { describe, expect, it } from "vitest";
import {
  DASHBOARD_MOUNTS_FULL_TASK_LIST,
  shouldVirtualizeTaskList,
  TASK_LIST_VIRTUALIZE_THRESHOLD,
  TASK_SEARCH_RESULT_LIMIT,
} from "./task-list-performance";

describe("task-list-performance", () => {
  it("dashboard defers full task list to /tasks", () => {
    expect(DASHBOARD_MOUNTS_FULL_TASK_LIST).toBe(false);
  });

  it("virtualizes when row count exceeds threshold", () => {
    expect(shouldVirtualizeTaskList(TASK_LIST_VIRTUALIZE_THRESHOLD)).toBe(false);
    expect(shouldVirtualizeTaskList(TASK_LIST_VIRTUALIZE_THRESHOLD + 1)).toBe(true);
  });

  it("respects custom threshold", () => {
    expect(shouldVirtualizeTaskList(50, 50)).toBe(false);
    expect(shouldVirtualizeTaskList(51, 50)).toBe(true);
  });

  it("exports a positive search cap for server alignment", () => {
    expect(TASK_SEARCH_RESULT_LIMIT).toBeGreaterThan(0);
  });
});
