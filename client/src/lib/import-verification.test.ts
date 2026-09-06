import { describe, expect, it } from "vitest";
import { verifyImportedTaskPresence } from "./import-verification";

describe("verifyImportedTaskPresence", () => {
  it("proves all selected logical tasks are present even when one source row is a duplicate", () => {
    const expected = [
      { date: "2026-09-06", activity: "Task A", notes: "First" },
      { date: "2026-09-06", activity: " Task A ", notes: " first " },
      { date: "2026-09-06", activity: "Task B", notes: "Second" },
    ];
    const current = [
      { date: "2026-09-06", activity: "task a", notes: "first" },
      { date: "2026-09-06", activity: "Task B", notes: "Second" },
      { date: "2026-09-05", activity: "Unrelated", notes: "Keep me" },
    ];

    expect(verifyImportedTaskPresence(expected, current)).toEqual({
      expectedLogicalTasks: 2,
      presentLogicalTasks: 2,
      missingLogicalTasks: 0,
      missing: [],
    });
  });

  it("reports the exact logical task that is still missing", () => {
    const missingTask = {
      date: "2026-09-06",
      time: "09:00",
      activity: "Morning commitment",
      notes: "Bring equipment",
    };

    const result = verifyImportedTaskPresence(
      [
        { date: "2026-09-06", activity: "Task A", notes: "First" },
        missingTask,
      ],
      [{ date: "2026-09-06", activity: "Task A", notes: "First" }],
    );

    expect(result.expectedLogicalTasks).toBe(2);
    expect(result.presentLogicalTasks).toBe(1);
    expect(result.missingLogicalTasks).toBe(1);
    expect(result.missing).toEqual([missingTask]);
  });
});
