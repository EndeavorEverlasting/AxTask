import { describe, expect, it } from "vitest";
import { TASK_SEARCH_RESULT_LIMIT } from "./task-list-limits";

describe("task-list-limits", () => {
  it("keeps search payloads bounded", () => {
    expect(TASK_SEARCH_RESULT_LIMIT).toBe(500);
  });
});
