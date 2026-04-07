// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

describe("productivity-export-pricing", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.AXTASK_EXPORT_CHECKLIST_PDF_COINS;
    delete process.env.AXTASK_EXPORT_TASKS_SPREADSHEET_COINS;
    delete process.env.AXTASK_EXPORT_TASK_REPORT_PDF_COINS;
    delete process.env.AXTASK_EXPORT_TASK_REPORT_XLSX_COINS;
    delete process.env.AXTASK_FREE_PRODUCTIVITY_EXPORTS;
    process.env.NODE_ENV = "test";
  });

  it("uses documented defaults when env is unset", async () => {
    const m = await import("./productivity-export-pricing");
    expect(m.getChecklistPdfExportCost()).toBe(15);
    expect(m.getTasksSpreadsheetExportCost()).toBe(20);
    expect(m.getTaskReportPdfCost()).toBe(25);
    expect(m.getTaskReportXlsxCost()).toBe(25);
  });

  it("parses non-negative integer overrides", async () => {
    process.env.AXTASK_EXPORT_CHECKLIST_PDF_COINS = "99";
    vi.resetModules();
    const m = await import("./productivity-export-pricing");
    expect(m.getChecklistPdfExportCost()).toBe(99);
  });

  it("freeInDev only when flag and development", async () => {
    process.env.NODE_ENV = "development";
    process.env.AXTASK_FREE_PRODUCTIVITY_EXPORTS = "1";
    vi.resetModules();
    const m = await import("./productivity-export-pricing");
    expect(m.productivityExportsFreeInDev()).toBe(true);
  });

  it("does not treat free export flag as active in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.AXTASK_FREE_PRODUCTIVITY_EXPORTS = "1";
    vi.resetModules();
    const m = await import("./productivity-export-pricing");
    expect(m.productivityExportsFreeInDev()).toBe(false);
  });
});
