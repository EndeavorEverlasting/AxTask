// @vitest-environment node
import { describe, expect, it } from "vitest";
import { insertTaskSchema, updateTaskSchema } from "./schema";

/**
 * Contract tests for the Gantt timeline fields added to `tasks`.
 *
 * These lock in the freemium shape promised on the /planner Gantt: all four
 * fields are optional (existing tasks without them keep working) but validated
 * when present. Breaking these invariants would regress the "free Gantt
 * baseline derived from date+effort" fallback.
 */
describe("insertTaskSchema — Gantt timeline fields", () => {
  const base = {
    date: "2026-04-20",
    activity: "Draft proposal",
  };

  it("accepts a task with no Gantt fields (free baseline uses date+effort)", () => {
    const parsed = insertTaskSchema.parse(base);
    expect(parsed.startDate).toBeUndefined();
    expect(parsed.endDate).toBeUndefined();
    expect(parsed.durationMinutes).toBeUndefined();
    expect(parsed.dependsOn).toBeUndefined();
  });

  it("accepts all four Gantt fields when supplied", () => {
    const parsed = insertTaskSchema.parse({
      ...base,
      startDate: "2026-04-20T09:00",
      endDate: "2026-04-20T11:30",
      durationMinutes: 150,
      dependsOn: ["task-a", "task-b"],
    });
    expect(parsed.startDate).toBe("2026-04-20T09:00");
    expect(parsed.endDate).toBe("2026-04-20T11:30");
    expect(parsed.durationMinutes).toBe(150);
    expect(parsed.dependsOn).toEqual(["task-a", "task-b"]);
  });

  it("accepts explicit nulls (DB round-trip friendly)", () => {
    const parsed = insertTaskSchema.parse({
      ...base,
      startDate: null,
      endDate: null,
      durationMinutes: null,
      dependsOn: null,
    });
    expect(parsed.startDate).toBeNull();
    expect(parsed.dependsOn).toBeNull();
  });

  it("rejects negative durations", () => {
    expect(() =>
      insertTaskSchema.parse({ ...base, durationMinutes: -5 }),
    ).toThrow();
  });

  it("caps dependsOn at 32 entries to bound payload size", () => {
    const many = Array.from({ length: 33 }, (_, i) => `task-${i}`);
    expect(() => insertTaskSchema.parse({ ...base, dependsOn: many })).toThrow();
    const okay = Array.from({ length: 32 }, (_, i) => `task-${i}`);
    expect(() => insertTaskSchema.parse({ ...base, dependsOn: okay })).not.toThrow();
  });

  it("rejects non-string dependency ids", () => {
    expect(() =>
      insertTaskSchema.parse({
        ...base,
        dependsOn: ["ok", 42 as unknown as string],
      }),
    ).toThrow();
  });

  it("is inherited correctly by updateTaskSchema (all Gantt fields remain optional)", () => {
    const parsed = updateTaskSchema.parse({
      id: "task-1",
      startDate: "2026-04-21",
    });
    expect(parsed.startDate).toBe("2026-04-21");
    expect(parsed.endDate).toBeUndefined();
  });
});
