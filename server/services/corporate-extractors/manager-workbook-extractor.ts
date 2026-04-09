/**
 * Extractor #3 – Bonita manager workbook
 *
 * File: Neuron Track hours.xlsx
 *   (or CANDIDATE_Neuron_Track_hours_with_Field_Insights_2026-04-09.xlsx)
 *
 * Parses:
 *   A. Monthly sheets (Mar 26, etc.) → manager_existing_rows
 *   B. List                          → validation_lists
 */
import type {
  ManagerWorkbookResult,
  ManagerExistingRow,
  ValidationList,
  IngestError,
} from "./types";
import {
  readWorkbook,
  sheetRows,
  headerRow,
  findCol,
  cellStr,
} from "./utils";
import { parseDayBlockSheet } from "./roster-billing-extractor";

// ─────────────────────────────────────────────────────────────────────────────
// A. Monthly sheets (Mar 26, Jan 26 – Jun 26)
//    Header rows: 1-2 (0-based 0-1)   Data starts: row 3 (0-based 2)
//    Day-block format with weekday label / date anchor in column A
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_SHEET_PATTERN = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2}$/i;

function parseMonthSheets(
  wb: ReturnType<typeof readWorkbook>,
  _errors: IngestError[],
): ManagerExistingRow[] {
  const results: ManagerExistingRow[] = [];

  for (const sheetName of wb.SheetNames) {
    if (!MONTH_SHEET_PATTERN.test(sheetName)) continue;

    const allRaw: unknown[][] = sheetRows(wb, sheetName, 0);
    if (allRaw.length < 3) continue;

    const sheetRows_ = parseDayBlockSheet(allRaw, sheetName, 2);
    results.push(...sheetRows_);
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// B. List (validation dictionary)
// ─────────────────────────────────────────────────────────────────────────────

function parseListSheet(wb: ReturnType<typeof readWorkbook>): ValidationList {
  const SHEET = "List";
  const headers = headerRow(wb, SHEET, 0);
  const empty: ValidationList = { tech_names: [], time_values: [], assignment_types: [] };
  if (headers.length === 0) return empty;

  const col = (l: string) => findCol(headers, l);
  const iNames = col("tech names");
  const iTime = col("time");
  const iAssignment = col("assignment type");

  const allRows = sheetRows(wb, SHEET, 1);
  const names: string[] = [];
  const times: string[] = [];
  const assignments: string[] = [];

  for (const row of allRows) {
    const r = row as unknown[];
    const n = iNames >= 0 ? cellStr(r, iNames) : "";
    const t = iTime >= 0 ? cellStr(r, iTime) : "";
    const a = iAssignment >= 0 ? cellStr(r, iAssignment) : "";
    if (n) names.push(n);
    if (t) times.push(t);
    if (a) assignments.push(a);
  }

  return { tech_names: names, time_values: times, assignment_types: assignments };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function extractManagerWorkbook(filePath: string): ManagerWorkbookResult {
  const wb = readWorkbook(filePath);
  const errors: IngestError[] = [];

  return {
    manager_existing_rows: parseMonthSheets(wb, errors),
    validation_lists: parseListSheet(wb),
    errors,
  };
}

