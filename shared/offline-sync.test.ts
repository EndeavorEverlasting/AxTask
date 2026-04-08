import { describe, expect, it } from "vitest";
import { isTaskConflictPayload, taskUpdatedAtMatchesServer } from "./offline-sync";

describe("offline-sync", () => {
  it("taskUpdatedAtMatchesServer allows 1ms tolerance", () => {
    const base = new Date("2026-01-15T12:00:00.000Z");
    expect(taskUpdatedAtMatchesServer(base, "2026-01-15T12:00:00.000Z")).toBe(true);
    expect(taskUpdatedAtMatchesServer(base, "2026-01-15T12:00:00.001Z")).toBe(true);
    expect(taskUpdatedAtMatchesServer(base, "2026-01-15T12:00:01.000Z")).toBe(false);
  });

  it("isTaskConflictPayload narrows 409 JSON", () => {
    expect(isTaskConflictPayload(null)).toBe(false);
    expect(
      isTaskConflictPayload({
        code: "task_conflict",
        message: "x",
        serverTask: { id: "1" },
      }),
    ).toBe(true);
  });
});
