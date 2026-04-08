import { describe, it, expect } from "vitest";
import { parseTasksFromCSV, tasksToCSV } from "./csv-utils";

describe("csv-utils", () => {
  describe("parseTasksFromCSV", () => {
    it("parses basic CSV with standard headers", () => {
      const csv = `date,activity,notes,status
2025-06-15,Fix bug,Critical error,pending
2025-06-16,Write tests,Unit tests,completed`;

      const tasks = parseTasksFromCSV(csv);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].date).toBe("2025-06-15");
      expect(tasks[0].activity).toBe("Fix bug");
      expect(tasks[0].notes).toBe("Critical error");
    });

    it("converts M/D/YYYY date format to YYYY-MM-DD", () => {
      const csv = `Date,Activity
6/1/2025,Do something`;

      const tasks = parseTasksFromCSV(csv);
      expect(tasks[0].date).toBe("2025-06-01");
    });

    it("returns empty array for empty CSV", () => {
      const tasks = parseTasksFromCSV("");
      expect(tasks).toEqual([]);
    });

    it("handles alternative header names (task, title, description)", () => {
      const csv = `date,task,description
2025-01-01,My task,Some description`;

      const tasks = parseTasksFromCSV(csv);
      expect(tasks[0].activity).toBe("My task");
      expect(tasks[0].notes).toBe("Some description");
    });

    it("defaults missing date to today", () => {
      const csv = `activity,notes
Do thing,Some note`;

      const tasks = parseTasksFromCSV(csv);
      const today = new Date().toISOString().split("T")[0];
      expect(tasks[0].date).toBe(today);
    });

    it("parseTasksFromCSV ignores leading AxTask attribution line", () => {
      const body = `date,activity,notes,status
2025-06-15,Fix bug,Critical,pending`;
      const csv = `# AxTask — test — exported 2025-01-01T00:00:00.000Z\n${body}`;
      const tasks = parseTasksFromCSV(csv);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].activity).toBe("Fix bug");
    });
  });

  describe("tasksToCSV", () => {
    it("exports tasks to CSV string", () => {
      const tasks = [
        {
          id: "1",
          date: "2025-06-15",
          time: "09:00",
          activity: "Fix bug",
          notes: "Critical",
          status: "pending",
          priority: "High",
          priorityScore: 8,
          classification: "Development",
          urgency: 4,
          impact: 5,
          effort: 2,
          prerequisites: "",
          sortOrder: 0,
          userId: null,
          createdAt: "2025-06-15T00:00:00Z",
        },
      ];

      const csv = tasksToCSV(tasks as any);
      expect(csv.split("\n")[0]).toMatch(/^# AxTask —/);
      expect(csv).toContain("Fix bug");
      expect(csv).toContain("2025-06-15");
      expect(csv).toContain("Critical");
    });

    it("returns empty string for empty array", () => {
      const csv = tasksToCSV([]);
      expect(csv).toBe("");
    });
  });
});

