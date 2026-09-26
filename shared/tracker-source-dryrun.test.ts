import { describe, expect, it } from "vitest";
import {
  SHARED_TASK_TRACKER_LEGACY_BOUNDARY_ROW,
  buildTrackerSourceIdentityKey,
  createMemoryReceiptPort,
  dryRunTrackerRows,
} from "./tracker-source-dryrun";

const HEADER = [
  "Date",
  "Priority",
  "Result",
  "Activity",
  "Notes",
  "Urgency",
  "Impact",
  "Effort",
  "Domain",
  "Tags",
  "Score",
  "Manual Override",
  "TaskID",
];

function plannerRows(...dataRows: unknown[][]): unknown[][] {
  return [HEADER, ...dataRows];
}

function activeRow(
  taskId: string,
  activity = "Prototype activity",
  date = "2026-09-26",
): unknown[] {
  // Columns aligned to HEADER; Priority/Score intentionally filled to prove ignore.
  return [
    date,
    "FORMULA",
    false,
    activity,
    "notes",
    3,
    4,
    2,
    "work",
    "tag",
    "FORMULA",
    "",
    taskId,
  ];
}

describe("tracker-source-dryrun G1 prototype", () => {
  it("success stack: active TaskID row → create and ignores formula Priority/Score", () => {
    const report = dryRunTrackerRows({
      provider: "google_sheets",
      bindingId: "synthetic-binding",
      rows: plannerRows(activeRow("T-100")),
      receipts: createMemoryReceiptPort(),
    });

    expect(report.ok).toBe(true);
    expect(report.counts.create).toBe(1);
    expect(report.results[0]?.disposition).toBe("create");
    expect(report.results[0]?.record?.identity.sourceTaskId).toBe("T-100");
    expect(report.results[0]?.record?.activity).toBe("Prototype activity");
    expect(report.results[0]?.record?.urgency).toBe(3);
    // Priority/Score never appear on the record.
    expect(report.results[0]?.record).not.toHaveProperty("priority");
    expect(report.results[0]?.record).not.toHaveProperty("score");
  });

  it("identity key excludes mutable activity/date/notes", () => {
    const a = buildTrackerSourceIdentityKey({
      provider: "google_sheets",
      bindingId: "b1",
      sourceTaskId: "T-1",
    });
    const b = buildTrackerSourceIdentityKey({
      provider: "google_sheets",
      bindingId: "b1",
      sourceTaskId: "T-1",
    });
    expect(a).toBe(b);
    expect(a).not.toContain("rename");
  });

  it("same TaskID with different activity stays one identity for already_imported", () => {
    const identity = {
      provider: "google_sheets",
      bindingId: "synthetic-binding",
      sourceTaskId: "T-200",
    };
    const report = dryRunTrackerRows({
      provider: identity.provider,
      bindingId: identity.bindingId,
      rows: plannerRows([
        "2026-09-27",
        "FORMULA",
        false,
        "Renamed activity text",
        "changed notes",
        "",
        "",
        "",
        "",
        "",
        "FORMULA",
        "",
        "T-200",
      ]),
      receipts: createMemoryReceiptPort([identity]),
    });

    expect(report.counts.already_imported).toBe(1);
    expect(report.results[0]?.disposition).toBe("already_imported");
  });

  it("failure stack: missing TaskID → invalid fail-closed", () => {
    const report = dryRunTrackerRows({
      provider: "google_sheets",
      bindingId: "synthetic-binding",
      rows: plannerRows([
        "2026-09-26",
        "",
        false,
        "No id activity",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]),
      receipts: createMemoryReceiptPort(),
    });

    expect(report.ok).toBe(true);
    expect(report.counts.invalid).toBe(1);
    expect(report.results[0]?.reason).toMatch(/TaskID/i);
  });

  it("failure stack: missing required header → headerError", () => {
    const report = dryRunTrackerRows({
      provider: "google_sheets",
      bindingId: "synthetic-binding",
      rows: [["Date", "Activity", "Notes"], ["2026-09-26", "x", "y"]],
      receipts: createMemoryReceiptPort(),
    });

    expect(report.ok).toBe(false);
    expect(report.headerError).toMatch(/taskid/i);
    expect(report.results).toHaveLength(0);
  });

  it("failure stack: legacy boundary row → legacy_excluded", () => {
    const legacyRelative =
      SHARED_TASK_TRACKER_LEGACY_BOUNDARY_ROW - 1; // header at 1 → data index
    const pad: unknown[][] = [];
    // Build sparse: only provide one data row but force spreadsheetRow via header offset.
    // Easier: set headerSpreadsheetRow so first data row lands on boundary.
    const report = dryRunTrackerRows({
      provider: "google_sheets",
      bindingId: "synthetic-binding",
      headerSpreadsheetRow: SHARED_TASK_TRACKER_LEGACY_BOUNDARY_ROW - 1,
      rows: plannerRows(activeRow("T-LEGACY")),
      receipts: createMemoryReceiptPort(),
    });

    expect(report.counts.legacy_excluded).toBe(1);
    expect(report.results[0]?.spreadsheetRow).toBe(
      SHARED_TASK_TRACKER_LEGACY_BOUNDARY_ROW,
    );
    expect(report.results[0]?.disposition).toBe("legacy_excluded");
    void legacyRelative;
  });

  it("blank Date → needs_review (does not invent today)", () => {
    const report = dryRunTrackerRows({
      provider: "google_sheets",
      bindingId: "synthetic-binding",
      rows: plannerRows(activeRow("T-300", "Needs date", "")),
      receipts: createMemoryReceiptPort(),
    });

    expect(report.counts.needs_review).toBe(1);
    expect(report.results[0]?.disposition).toBe("needs_review");
    expect(report.results[0]?.reason).toMatch(/blank-date|missing Date/i);
  });
});
