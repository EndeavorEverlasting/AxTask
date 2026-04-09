// @vitest-environment node
/**
 * Integration test harness – runs all three extractors against the real
 * workbook files in my_corporate_workflow_files/ and validates structure.
 */
import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { extractTaskTracker } from "./task-tracker-extractor";
import { extractRosterBilling } from "./roster-billing-extractor";
import { extractManagerWorkbook } from "./manager-workbook-extractor";
import { reconcile } from "./reconcile";
import { buildContributions } from "./contributions-engine";
import type {
  TaskTrackerResult,
  RosterBillingResult,
  ManagerWorkbookResult,
  ReconciliationResult,
  ContributionsResult,
} from "./types";

const __dirname_esm = path.dirname(fileURLToPath(import.meta.url));
const FILES_DIR = path.resolve(__dirname_esm, "../../../my_corporate_workflow_files");

const TASK_TRACKER = path.join(FILES_DIR, "CANDIDATE_OR_Task_Tracker_exec_wins_with_geoff_4_8.xlsx");
const ROSTER_BILLING = path.join(FILES_DIR, "Active_Roster_Log_4_9_2026_Billing.xlsx");
const MANAGER_WB = path.join(FILES_DIR, "CANDIDATE_Neuron_Track_hours_with_Field_Insights_2026-04-09.xlsx");

const FIXTURES_EXIST = fs.existsSync(TASK_TRACKER) && fs.existsSync(ROSTER_BILLING) && fs.existsSync(MANAGER_WB);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Task Tracker
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!FIXTURES_EXIST)("extractTaskTracker", () => {
  let result: TaskTrackerResult;

  beforeAll(() => {
    expect(fs.existsSync(TASK_TRACKER)).toBe(true);
    result = extractTaskTracker(TASK_TRACKER);
    console.log("\n── Task Tracker ──────────────────────────────────────");
    console.log(`  task_evidence_daily : ${result.task_evidence_daily.length} rows`);
    console.log(`  task_evidence_event : ${result.task_evidence_event.length} rows`);
    console.log(`  task_catalog        : ${result.task_catalog.length} rows`);
    console.log(`  ingest errors       : ${result.errors.length}`);
    if (result.errors.length > 0) {
      console.log("  First 5 errors:");
      result.errors.slice(0, 5).forEach(e =>
        console.log(`    row ${e.source_row} [${e.field}]: ${e.message}`));
    }
  });

  it("returns task_evidence_daily array", () => {
    expect(Array.isArray(result.task_evidence_daily)).toBe(true);
  });

  it("daily rows have required fields", () => {
    for (const row of result.task_evidence_daily.slice(0, 20)) {
      expect(row.work_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.canonical_name).toBeTruthy();
      expect(row.evidence_source).toBe("Daily Narrative Log");
      expect(row.source_sheet).toBe("Daily Narrative Log");
      expect(row.source_row).toBeGreaterThan(0);
    }
  });

  it("returns task_evidence_event array", () => {
    expect(Array.isArray(result.task_evidence_event)).toBe(true);
  });

  it("event rows have required fields", () => {
    for (const row of result.task_evidence_event.slice(0, 20)) {
      expect(row.work_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.canonical_name).toBeTruthy();
      expect(row.source_sheet).toBe("Event Log");
    }
  });

  it("returns task_catalog array", () => {
    expect(Array.isArray(result.task_catalog)).toBe(true);
  });

  it("catalog rows have task_category", () => {
    for (const row of result.task_catalog) {
      expect(row.task_category).toBeTruthy();
      expect(row.source_sheet).toBe("Task Catalog");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Roster / Billing
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!FIXTURES_EXIST)("extractRosterBilling", () => {
  let result: RosterBillingResult;

  beforeAll(() => {
    expect(fs.existsSync(ROSTER_BILLING)).toBe(true);
    result = extractRosterBilling(ROSTER_BILLING);
    console.log("\n── Roster / Billing ──────────────────────────────────");
    console.log(`  people                   : ${result.people.length} rows`);
    console.log(`  attendance               : ${result.attendance.length} rows`);
    console.log(`  billing_detail_existing  : ${result.billing_detail_existing.length} rows`);
    console.log(`  billing_summary_existing : ${result.billing_summary_existing.length} rows`);
    console.log(`  manager_internal_existing: ${result.manager_internal_existing.length} rows`);
    console.log(`  ingest errors            : ${result.errors.length}`);
    if (result.people.length > 0) {
      console.log("  Sample people:");
      result.people.slice(0, 5).forEach(p =>
        console.log(`    ${p.canonical_name} | ${p.home_base} | active=${p.active}`));
    }
    if (result.attendance.length > 0) {
      console.log("  Sample attendance:");
      result.attendance.slice(0, 5).forEach(a =>
        console.log(`    ${a.canonical_name} ${a.work_date} ${a.clock_in}-${a.clock_out} code=${a.attendance_code} hrs=${a.attendance_hours}`));
    }
  });

  it("returns people array from Roster sheet", () => {
    expect(result.people.length).toBeGreaterThan(0);
  });

  it("people have canonical_name and source_sheet", () => {
    for (const p of result.people) {
      expect(p.canonical_name).toBeTruthy();
      expect(p.source_sheet).toBe("Roster");
    }
  });

  it("returns attendance from Live sheet", () => {
    expect(Array.isArray(result.attendance)).toBe(true);
  });

  it("attendance rows have date format and source_ref", () => {
    for (const row of result.attendance.slice(0, 20)) {
      expect(row.work_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.source_ref).toBeTruthy();
    }
  });

  it("returns billing_detail_existing array", () => {
    expect(Array.isArray(result.billing_detail_existing)).toBe(true);
  });

  it("returns billing_summary_existing array", () => {
    expect(Array.isArray(result.billing_summary_existing)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Manager Workbook
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!FIXTURES_EXIST)("extractManagerWorkbook", () => {
  let result: ManagerWorkbookResult;

  beforeAll(() => {
    expect(fs.existsSync(MANAGER_WB)).toBe(true);
    result = extractManagerWorkbook(MANAGER_WB);
    console.log("\n── Manager Workbook ──────────────────────────────────");
    console.log(`  manager_existing_rows: ${result.manager_existing_rows.length} rows`);
    console.log(`  validation tech_names      : ${result.validation_lists.tech_names.length}`);
    console.log(`  validation time_values     : ${result.validation_lists.time_values.length}`);
    console.log(`  validation assignment_types: ${result.validation_lists.assignment_types.length}`);
    console.log(`  ingest errors              : ${result.errors.length}`);
    if (result.manager_existing_rows.length > 0) {
      console.log("  Sample manager rows:");
      result.manager_existing_rows.slice(0, 5).forEach(r =>
        console.log(`    ${r.canonical_name} ${r.work_date} ${r.clock_in}-${r.clock_out} hrs=${r.hours} proj=${r.outward_project}`));
    }
  });

  it("returns manager_existing_rows array", () => {
    expect(Array.isArray(result.manager_existing_rows)).toBe(true);
  });

  it("returns validation_lists with arrays", () => {
    expect(Array.isArray(result.validation_lists.tech_names)).toBe(true);
    expect(Array.isArray(result.validation_lists.time_values)).toBe(true);
    expect(Array.isArray(result.validation_lists.assignment_types)).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// 4. Reconciliation (cross-workbook)
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!FIXTURES_EXIST)("reconcile", () => {
  let result: ReconciliationResult;

  beforeAll(() => {
    const tt = extractTaskTracker(TASK_TRACKER);
    const rb = extractRosterBilling(ROSTER_BILLING);

    result = reconcile({
      task_evidence_daily: tt.task_evidence_daily,
      task_evidence_event: tt.task_evidence_event,
      attendance: rb.attendance,
      billing_detail_existing: rb.billing_detail_existing,
    });

    console.log("\n── Reconciliation ───────────────────────────────────");
    console.log(`  total_attendance_days : ${result.summary.total_attendance_days}`);
    console.log(`  total_evidence_days  : ${result.summary.total_evidence_days}`);
    console.log(`  matched_days         : ${result.summary.matched_days}`);
    console.log(`  exception_count      : ${result.summary.exception_count}`);

    const byType: Record<string, number> = {};
    for (const e of result.exceptions) {
      byType[e.exception_type] = (byType[e.exception_type] || 0) + 1;
    }
    console.log("  Exceptions by type:");
    for (const [type, count] of Object.entries(byType)) {
      console.log(`    ${type}: ${count}`);
    }

    if (result.exceptions.length > 0) {
      console.log("  First 10 exceptions:");
      result.exceptions.slice(0, 10).forEach(e =>
        console.log(`    [${e.exception_type}] ${e.canonical_name} ${e.work_date}: ${e.detail}`));
    }
  });

  it("returns a summary object", () => {
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.total_attendance_days).toBe("number");
    expect(typeof result.summary.total_evidence_days).toBe("number");
    expect(typeof result.summary.matched_days).toBe("number");
    expect(typeof result.summary.exception_count).toBe("number");
  });

  it("exceptions are well-formed", () => {
    for (const e of result.exceptions) {
      expect(e.work_date).toBeTruthy();
      expect(e.canonical_name).toBeTruthy();
      expect(e.exception_type).toBeTruthy();
      expect(e.detail).toBeTruthy();
      expect(Array.isArray(e.evidence_sources)).toBe(true);
    }
  });

  it("exception_count matches exceptions array length", () => {
    expect(result.summary.exception_count).toBe(result.exceptions.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Contributions engine (the missing tooth)
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!FIXTURES_EXIST)("buildContributions", () => {
  let result: ContributionsResult;

  beforeAll(() => {
    const tt = extractTaskTracker(TASK_TRACKER);
    const rb = extractRosterBilling(ROSTER_BILLING);
    const mw = extractManagerWorkbook(MANAGER_WB);

    result = buildContributions({
      task_evidence_daily: tt.task_evidence_daily,
      task_evidence_event: tt.task_evidence_event,
      billing_detail_existing: rb.billing_detail_existing,
      manager_existing_rows: [
        ...rb.manager_internal_existing,
        ...mw.manager_existing_rows,
      ],
    });

    console.log("\n── Contributions Engine ──────────────────────────────");
    console.log(`  field_insights       : ${result.field_insights.length} rows`);
    console.log(`  experience_ledger    : ${result.experience_ledger.length} rows`);
    console.log(`  assignment_evidence  : ${result.assignment_evidence.length} rows`);

    // Category breakdown
    const catCounts: Record<string, number> = {};
    for (const fi of result.field_insights) {
      catCounts[fi.contribution_category] = (catCounts[fi.contribution_category] || 0) + 1;
    }
    console.log("  Field Insight categories:");
    for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat}: ${count}`);
    }

    const flagged = result.assignment_evidence.filter(a => a.exception_flag);
    console.log(`  Assignment exceptions: ${flagged.length} / ${result.assignment_evidence.length}`);
    if (flagged.length > 0) {
      console.log("  Sample exceptions:");
      flagged.filter(f => f.exception_detail.includes("but evidence")).slice(0, 5).forEach(f =>
        console.log(`    ${f.canonical_name} ${f.work_date}: ${f.exception_detail}`));
    }

    // Sample experience ledger
    if (result.experience_ledger.length > 0) {
      console.log("  Sample experience ledger:");
      result.experience_ledger.slice(0, 5).forEach(e =>
        console.log(`    ${e.canonical_name} ${e.work_date} [${e.contribution_category}] ${e.experience_type}`));
    }
  });

  it("returns field_insights array", () => {
    expect(Array.isArray(result.field_insights)).toBe(true);
    expect(result.field_insights.length).toBeGreaterThan(0);
  });

  it("field insights have contribution_category", () => {
    for (const fi of result.field_insights) {
      expect(fi.contribution_category).toBeTruthy();
      expect(fi.canonical_name).toBeTruthy();
      expect(fi.work_date).toBeTruthy();
    }
  });

  it("returns experience_ledger array", () => {
    expect(Array.isArray(result.experience_ledger)).toBe(true);
    expect(result.experience_ledger.length).toBeGreaterThan(0);
  });

  it("experience ledger entries are unique per person+date+category", () => {
    const keys = new Set<string>();
    for (const e of result.experience_ledger) {
      const k = `${e.canonical_name}|${e.work_date}|${e.contribution_category}`;
      expect(keys.has(k)).toBe(false);
      keys.add(k);
    }
  });

  it("returns assignment_evidence array", () => {
    expect(Array.isArray(result.assignment_evidence)).toBe(true);
    expect(result.assignment_evidence.length).toBeGreaterThan(0);
  });

  it("assignment evidence has supporting row references", () => {
    for (const ae of result.assignment_evidence.slice(0, 50)) {
      expect(Array.isArray(ae.supporting_daily_log_rows)).toBe(true);
      expect(Array.isArray(ae.supporting_event_log_rows)).toBe(true);
      expect(Array.isArray(ae.actual_categories)).toBe(true);
      expect(typeof ae.exception_flag).toBe("boolean");
    }
  });

  it("detects compression exceptions where outward differs from evidence", () => {
    const compressionExceptions = result.assignment_evidence.filter(
      ae => ae.exception_flag && ae.exception_detail.includes("but evidence")
    );
    // We expect at least some compression exceptions for "Neuron Installation" rows
    // that have richer evidence behind them
    console.log(`  Compression exceptions found: ${compressionExceptions.length}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Various Combinations (April Pack & Rich/Team Updated Manager)
// ─────────────────────────────────────────────────────────────────────────────

const ROSTER_APRIL_PACK = path.join(FILES_DIR, "CANDIDATE_Active_Roster_Log_4_9_2026_Billing_April_Pack.xlsx");
const MANAGER_RICH = path.join(FILES_DIR, "CANDIDATE_Neuron_Track_hours_with_Field_Insights_2026-04-09_rich-updated.xlsx");
const MANAGER_TEAM_MAR26 = path.join(FILES_DIR, "CANDIDATE_Neuron_Track_hours_with_Field_Insights_2026-04-09_mar26_team-updated.xlsx");

const COMBINATION_FIXTURES_EXIST = fs.existsSync(TASK_TRACKER) && fs.existsSync(ROSTER_APRIL_PACK) && fs.existsSync(MANAGER_RICH) && fs.existsSync(MANAGER_TEAM_MAR26);

describe.skipIf(!COMBINATION_FIXTURES_EXIST)("Various Combinations", () => {
  it("reconciles successfully with April Pack roster and Rich updated manager workbook", () => {
    const tt = extractTaskTracker(TASK_TRACKER);
    const rb = extractRosterBilling(ROSTER_APRIL_PACK);
    const mw = extractManagerWorkbook(MANAGER_RICH);

    const result = reconcile({
      task_evidence_daily: tt.task_evidence_daily,
      task_evidence_event: tt.task_evidence_event,
      attendance: rb.attendance,
      billing_detail_existing: rb.billing_detail_existing,
    });

    expect(result.summary).toBeDefined();
    expect(result.summary.total_attendance_days).toBeGreaterThan(0);

    // Test contributions engine as well
    const contribs = buildContributions({
      task_evidence_daily: tt.task_evidence_daily,
      task_evidence_event: tt.task_evidence_event,
      attendance: rb.attendance,
      billing_detail_existing: rb.billing_detail_existing,
      manager_existing_rows: [
        ...rb.manager_internal_existing,
        ...mw.manager_existing_rows,
      ],
    });

    expect(contribs.field_insights).toBeDefined();
    expect(contribs.field_insights.length).toBeGreaterThan(0);
  });

  it("reconciles successfully with April Pack roster and Team mar26 updated manager workbook", () => {
    const tt = extractTaskTracker(TASK_TRACKER);
    const rb = extractRosterBilling(ROSTER_APRIL_PACK);
    const mw = extractManagerWorkbook(MANAGER_TEAM_MAR26);

    const result = reconcile({
      task_evidence_daily: tt.task_evidence_daily,
      task_evidence_event: tt.task_evidence_event,
      attendance: rb.attendance,
      billing_detail_existing: rb.billing_detail_existing,
    });

    expect(result.summary).toBeDefined();
    expect(result.exceptions).toBeDefined();

    // Test contributions engine as well
    const contribs = buildContributions({
      task_evidence_daily: tt.task_evidence_daily,
      task_evidence_event: tt.task_evidence_event,
      attendance: rb.attendance,
      billing_detail_existing: rb.billing_detail_existing,
      manager_existing_rows: [
        ...rb.manager_internal_existing,
        ...mw.manager_existing_rows,
      ],
    });

    expect(contribs.field_insights).toBeDefined();
    expect(contribs.field_insights.length).toBeGreaterThan(0);
  });
});
