import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleSheetsSync, googleSheetsUtils } from "./google-sheets-sync";

describe("GoogleSheetsSync", () => {
  describe("detectGoogleSheetsFormat", () => {
    it("returns false for empty or single-line CSV", () => {
      expect(GoogleSheetsSync.detectGoogleSheetsFormat("")).toBe(false);
      expect(GoogleSheetsSync.detectGoogleSheetsFormat("only header")).toBe(
        false,
      );
    });

    it("detects date,activity header pattern", () => {
      const csv = "Date,Activity,Notes\n2025-01-01,Do work,Note";
      expect(GoogleSheetsSync.detectGoogleSheetsFormat(csv)).toBe(true);
    });

    it("detects hollow-star marker used by rating columns", () => {
      const csv = "ColA,ColB\nx,☆☆☆☆☆";
      expect(GoogleSheetsSync.detectGoogleSheetsFormat(csv)).toBe(true);
    });
  });

  describe("formatForGoogleSheets", () => {
    it("includes headers and escapes quotes in activity/notes", () => {
      const csv = GoogleSheetsSync.formatForGoogleSheets([
        {
          date: "2025-06-01",
          activity: 'Say "hello"',
          notes: 'He said "ok"',
          priority: "High",
          classification: "Dev",
          priorityScore: 80,
          urgency: 4,
          impact: 3,
          effort: 2,
          prerequisites: 'a"b',
          status: "completed",
          updatedAt: new Date("2025-06-02T12:00:00Z"),
          createdAt: new Date("2025-06-01T00:00:00Z"),
        },
      ]);
      expect(csv).toContain("Date");
      expect(csv).toContain("Activity");
      expect(csv).toContain('Say ""hello""');
      expect(csv).toContain("TRUE");
    });
  });

  describe("analyzeChanges", () => {
    it("classifies new tasks from import", () => {
      const current = [{ activity: "Existing", notes: "a", urgency: 3 }];
      const imported = [
        { activity: "Existing", notes: "a", urgency: 3 },
        { activity: "Brand new", notes: "b", urgency: 3 },
      ];
      const r = GoogleSheetsSync.analyzeChanges(current as any, imported as any);
      expect(r.newTasks).toHaveLength(1);
      expect(r.newTasks[0].activity).toBe("Brand new");
    });

    it("flags conflict when local is newer than import date and fields differ", () => {
      const current = [
        {
          activity: "Same",
          notes: "local",
          urgency: 5,
          updatedAt: new Date("2025-06-10"),
        },
      ];
      const imported = [
        {
          activity: "Same",
          notes: "remote",
          urgency: 1,
          date: "2025-06-01",
        },
      ];
      const r = GoogleSheetsSync.analyzeChanges(current as any, imported as any);
      expect(r.conflicts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("auto sync timer", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("startAutoSync invokes callback on interval", () => {
      const cb = vi.fn();
      const sync = new GoogleSheetsSync({
        sheetName: "Tasks",
        lastSyncTime: "",
        autoSyncEnabled: true,
        syncInterval: 1,
      });
      sync.startAutoSync(cb);
      expect(cb).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60_000);
      expect(cb).toHaveBeenCalledTimes(1);
      sync.stopAutoSync();
      vi.advanceTimersByTime(60_000);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  it("generateSyncInstructions mentions Import/Export", () => {
    expect(GoogleSheetsSync.generateSyncInstructions()).toContain(
      "Import/Export",
    );
  });
});

describe("googleSheetsUtils", () => {
  it("validateGoogleSheetsFormat requires date and activity columns", () => {
    const bad = googleSheetsUtils.validateGoogleSheetsFormat("a,b\n1,2");
    expect(bad.isValid).toBe(false);
    expect(bad.errors.some((e) => e.includes("date"))).toBe(true);
    expect(bad.errors.some((e) => e.includes("activity"))).toBe(true);

    const good = googleSheetsUtils.validateGoogleSheetsFormat(
      "Date,Activity\n2025-01-01,Task",
    );
    expect(good.isValid).toBe(true);
  });

  it("validateGoogleSheetsFormat warns on tabs", () => {
    const r = googleSheetsUtils.validateGoogleSheetsFormat(
      "Date,Activity\n2025-01-01\tTask",
    );
    expect(r.warnings.some((w) => w.toLowerCase().includes("tab"))).toBe(true);
  });
});
