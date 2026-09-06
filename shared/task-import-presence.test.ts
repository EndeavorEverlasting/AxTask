import { describe, expect, it } from "vitest";
import { verifyTaskImportPresence } from "./task-import-identity";

describe("verifyTaskImportPresence", () => {
  it("proves every selected logical task is present when source rows repeat", () => {
    const result = verifyTaskImportPresence(
      [
        { date: "2026-09-06", activity: "Task A", notes: "First" },
        { date: "2026-09-06", activity: " task a ", notes: " first " },
        { date: "2026-09-06", activity: "Task B", notes: "Second" },
      ],
      [
        { date: "2026-09-06", activity: "TASK A", notes: "FIRST" },
        { date: "2026-09-06", activity: "Task B", notes: "Second" },
        { date: "2026-09-05", activity: "Unrelated", notes: "Keep" },
      ],
    );

    expect(result).toEqual({
      expectedLogicalTasks: 2,
      presentLogicalTasks: 2,
      missingLogicalTasks: 0,
      missing: [],
    });
  });

  it("reports the exact logical task that remains missing", () => {
    const missing = {
      date: "2026-09-06",
      time: "09:00",
      activity: "Morning commitment",
      notes: "Bring equipment",
    };

    const result = verifyTaskImportPresence(
      [
        { date: "2026-09-06", activity: "Task A", notes: "First" },
        missing,
      ],
      [{ date: "2026-09-06", activity: "Task A", notes: "First" }],
    );

    expect(result.expectedLogicalTasks).toBe(2);
    expect(result.presentLogicalTasks).toBe(1);
    expect(result.missingLogicalTasks).toBe(1);
    expect(result.missing).toEqual([missing]);
  });

  it("keeps delimiter-containing fields distinct", () => {
    const result = verifyTaskImportPresence(
      [
        { activity: "A|B", notes: "C" },
        { activity: "A", notes: "B|C" },
      ],
      [{ activity: "A|B", notes: "C" }],
    );

    expect(result.expectedLogicalTasks).toBe(2);
    expect(result.presentLogicalTasks).toBe(1);
    expect(result.missing).toEqual([{ activity: "A", notes: "B|C" }]);
  });
});
