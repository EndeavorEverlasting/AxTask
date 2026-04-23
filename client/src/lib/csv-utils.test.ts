import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseTasksFromCSV, parseTasksFromWorkbook, tasksToCSV } from "./csv-utils";

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

  describe("parseTasksFromWorkbook", () => {
    function makeWorkbook() {
      const wb = XLSX.utils.book_new();

      const planner2026 = XLSX.utils.aoa_to_sheet([
        ["Date", "Activity", "Notes", "Result", "Urgency", "Impact", "Effort"],
        ["2026-04-16", "Top system entry", "stay at top", true, 5, 5, 2],
      ]);
      XLSX.utils.book_append_sheet(wb, planner2026, "Daily Planner 2026");

      const archive2025 = XLSX.utils.aoa_to_sheet([
        ["Date", "Activity", "Notes", "Result"],
        ["2025-12-01", "Legacy 2025 activity", "older schema-ish", false],
      ]);
      XLSX.utils.book_append_sheet(wb, archive2025, "Archive 2025");

      const vault = XLSX.utils.aoa_to_sheet([
        ["Key", "Category", "Item", "Notes", "Source Date"],
        ["K-1", "Ops", "Vault task", "from vault", 46029], // 2026-01-03 Excel serial
      ]);
      XLSX.utils.book_append_sheet(wb, vault, "Vault");

      const readme = XLSX.utils.aoa_to_sheet([
        ["Instructions"],
        ["This sheet should be ignored by import parser"],
      ]);
      XLSX.utils.book_append_sheet(wb, readme, "README");

      return wb;
    }

    it("includes planner/archive/vault task rows and ignores non-import tabs", () => {
      const wb = makeWorkbook();
      const tasks = parseTasksFromWorkbook(wb);

      expect(tasks.length).toBeGreaterThanOrEqual(3);
      expect(tasks.some((t) => t.activity === "Top system entry")).toBe(true);
      expect(tasks.some((t) => t.activity === "Legacy 2025 activity")).toBe(true);
      expect(tasks.some((t) => t.activity === "Vault task")).toBe(true);
      expect(tasks.some((t) => t.activity === "This sheet should be ignored by import parser")).toBe(false);
    });

    it("supports configurable year filter for 2026-only mode", () => {
      const wb = makeWorkbook();
      const tasks = parseTasksFromWorkbook(wb, { mode: "year-filter", allowedYears: [2026] });

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.every((t) => String(t.date).startsWith("2026-"))).toBe(true);
      expect(tasks.some((t) => t.activity === "Legacy 2025 activity")).toBe(false);
    });

    it("supports configurable year filter for 2025+2026 mode", () => {
      const wb = makeWorkbook();
      const tasks = parseTasksFromWorkbook(wb, { mode: "year-filter", allowedYears: [2025, 2026] });

      expect(tasks.some((t) => String(t.date).startsWith("2025-"))).toBe(true);
      expect(tasks.some((t) => String(t.date).startsWith("2026-"))).toBe(true);
    });
  });

  describe("real custom workbook compatibility", () => {
    const customWorkbookPath = path.resolve(
      process.cwd(),
      "2026 Shared Task Tracker - 4_16_26 - Make data entry system stay at the top, Broken Priority, Score, Override, and TaskID.xlsx",
    );
    const hasCustomWorkbook = fs.existsSync(customWorkbookPath);

    it.skipIf(!hasCustomWorkbook)("parses the provided custom workbook shape", { timeout: 30_000 }, () => {
      const wb = XLSX.readFile(customWorkbookPath);
      const tasks = parseTasksFromWorkbook(wb, { mode: "year-filter", allowedYears: [2025, 2026] });

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.some((t) => String(t.date).startsWith("2025-"))).toBe(true);
      expect(tasks.some((t) => String(t.date).startsWith("2026-"))).toBe(true);
    });
  });
});

