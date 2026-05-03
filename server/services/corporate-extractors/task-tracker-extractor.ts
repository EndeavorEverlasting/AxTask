/**
 * Extractor #1 – Task Tracker workbook
 *
 * File: CANDIDATE_OR_Task_Tracker_exec_wins_with_geoff_4_8.xlsx
 *
 * Parses:
 *   A. Daily Narrative Log  → task_evidence_daily
 *   B. Event Log            → task_evidence_event
 *   C. Task Catalog         → task_catalog
 */
import type {
  TaskTrackerResult,
  TaskEvidenceDaily,
  TaskEvidenceEvent,
  TaskCatalogEntry,
  IngestError,
} from "./types";
import {
  readWorkbook,
  sheetRows,
  headerRow,
  findCol,
  cellStr,
  cellNum,
  normalizeDate,
  canonicalizePerson,
} from "./utils";

// ─────────────────────────────────────────────────────────────────────────────
// A. Daily Narrative Log
//    Header row: 4 (0-based index 3)   Data starts: row 5 (0-based index 4)
// ─────────────────────────────────────────────────────────────────────────────

function parseDailyNarrativeLog(
  wb: ReturnType<typeof readWorkbook>,
  errors: IngestError[],
): TaskEvidenceDaily[] {
  const SHEET = "Daily Narrative Log";
  const headers = headerRow(wb, SHEET, 3); // row 4 (0-based 3)
  if (headers.length === 0) return [];

  const iDate = findCol(headers, "date");
  const iPerson = findCol(headers, "person");
  const iSite = findCol(headers, "site");
  const iWorkstream = findCol(headers, "primary workstream");
  const iMethod = findCol(headers, "method / detail");
  const iState = findCol(headers, "record state");

  const allRows = sheetRows(wb, SHEET, 4); // data starts 0-based row 4
  const results: TaskEvidenceDaily[] = [];

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const excelRow = i + 5; // 1-based excel row number

    const rawDate = iDate >= 0 ? row[iDate] : undefined;
    const rawPerson = iPerson >= 0 ? cellStr(row, iPerson) : "";

    const dateStr = normalizeDate(rawDate);
    if (!dateStr) {
      if (rawPerson || rawDate) {
        errors.push({ source_sheet: SHEET, source_row: excelRow, field: "Date", message: "Blank or unparseable date", raw_value: rawDate });
      }
      continue;
    }
    if (!rawPerson) {
      errors.push({ source_sheet: SHEET, source_row: excelRow, field: "Person", message: "Blank person", raw_value: rawPerson });
      continue;
    }

    results.push({
      work_date: dateStr,
      canonical_name: canonicalizePerson(rawPerson),
      site: iSite >= 0 ? cellStr(row, iSite) : "",
      raw_workstream: iWorkstream >= 0 ? cellStr(row, iWorkstream) : "",
      notes: iMethod >= 0 ? cellStr(row, iMethod) : "",
      record_state: iState >= 0 ? cellStr(row, iState) : "",
      evidence_source: "Daily Narrative Log",
      source_sheet: "Daily Narrative Log",
      source_row: excelRow,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// B. Event Log
//    Header row: 5 (0-based 4)   Data starts: row 6 (0-based 5)
// ─────────────────────────────────────────────────────────────────────────────

function parseEventLog(
  wb: ReturnType<typeof readWorkbook>,
  errors: IngestError[],
): TaskEvidenceEvent[] {
  const SHEET = "Event Log";
  const headers = headerRow(wb, SHEET, 4);
  if (headers.length === 0) return [];

  const col = (label: string) => findCol(headers, label);

  const allRows = sheetRows(wb, SHEET, 5);
  const results: TaskEvidenceEvent[] = [];

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const excelRow = i + 6;

    const rawDate = col("event date") >= 0 ? row[col("event date")] : undefined;
    const dateStr = normalizeDate(rawDate);
    if (!dateStr) continue; // skip blank rows silently

    const person = col("person") >= 0 ? cellStr(row, col("person")) : "";
    if (!person) continue;

    results.push({
      work_date: dateStr,
      week_start: normalizeDate(col("week start") >= 0 ? row[col("week start")] : ""),
      canonical_name: canonicalizePerson(person),
      site: cellStr(row, col("site")),
      room_area: cellStr(row, col("room / area")),
      case_id: cellStr(row, col("case id")),
      normalized_workstream: cellStr(row, col("workstream")),
      event_type: cellStr(row, col("event type")),
      task_category: cellStr(row, col("task category")),
      quantity: cellNum(row, col("quantity")),
      unit_type: cellStr(row, col("unit type")),
      window_code: cellStr(row, col("window code")),
      std_hours_per_unit: cellNum(row, col("std hours / unit")),
      fixed_overhead_hours: cellNum(row, col("fixed overhead hrs")),
      complexity_factor: cellNum(row, col("complexity factor")),
      disruption_factor: cellNum(row, col("disruption factor")),
      travel_hours: cellNum(row, col("travel / transit hrs")),
      modeled_hours: cellNum(row, col("modeled hours")),
      suggested_hours: cellNum(row, col("suggested hours")),
      actual_billed_hours: cellNum(row, col("actual billed hours")),
      variance_hours: cellNum(row, col("variance hrs")),
      billable_flag: cellStr(row, col("billable flag")),
      narrative_tag: cellStr(row, col("narrative tag")),
      primary_hostname: cellStr(row, col("primary hostname")),
      related_asset_hostname: cellStr(row, col("related asset / hostname")),
      evidence_source_detail: cellStr(row, col("evidence source")),
      notes: cellStr(row, col("notes")),
      source_sheet: "Event Log",
      source_row: excelRow,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Task Catalog
//    Header row: 5 (0-based 4)   Data starts: row 6 (0-based 5)
// ─────────────────────────────────────────────────────────────────────────────

function parseTaskCatalog(
  wb: ReturnType<typeof readWorkbook>,
): TaskCatalogEntry[] {
  const SHEET = "Task Catalog";
  const headers = headerRow(wb, SHEET, 4);
  if (headers.length === 0) return [];

  const col = (label: string) => findCol(headers, label);

  const allRows = sheetRows(wb, SHEET, 5);
  const results: TaskCatalogEntry[] = [];

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const excelRow = i + 6;

    const category = cellStr(row, col("task category"));
    if (!category) continue; // skip empty rows

    results.push({
      task_category: category,
      default_workstream: cellStr(row, col("default workstream")),
      unit_type: cellStr(row, col("unit type")),
      default_window_code: cellStr(row, col("default window code")),
      std_hours_per_unit: cellNum(row, col("std hours per unit")),
      fixed_overhead_hours: cellNum(row, col("fixed overhead hours")),
      default_complexity_factor: cellNum(row, col("default complexity factor")),
      default_disruption_factor: cellNum(row, col("default disruption factor")),
      default_billable_flag: cellStr(row, col("default billable flag")),
      kpi_friendly: cellStr(row, col("kpi-friendly")),
      description: cellStr(row, col("description")),
      source_sheet: "Task Catalog",
      source_row: excelRow,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function extractTaskTracker(filePath: string): TaskTrackerResult {
  const wb = readWorkbook(filePath);
  const errors: IngestError[] = [];

  const task_evidence_daily = parseDailyNarrativeLog(wb, errors);
  const task_evidence_event = parseEventLog(wb, errors);
  const task_catalog = parseTaskCatalog(wb);

  return { task_evidence_daily, task_evidence_event, task_catalog, errors };
}

