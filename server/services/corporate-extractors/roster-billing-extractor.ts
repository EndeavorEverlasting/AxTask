/**
 * Extractor #2 – Active Roster / Billing workbook
 *
 * File: Active_Roster_Log_4_9_2026_Billing.xlsx
 *
 * Parses:
 *   A. Live - Mar 2026           → attendance
 *   B. Roster                    → people
 *   C. Billing Detail - Mar 2026 → billing_detail_existing
 *   D. Billing Summary - Mar 2026 → billing_summary_existing
 *   E. Bonitas Tracker - Mar 26  → manager_internal_existing
 */
import type {
  RosterBillingResult, Person, AttendanceRow, BillingDetailExisting,
  BillingSummaryExisting, ManagerExistingRow, IngestError,
} from "./types";
import {
  readWorkbook, sheetRows, headerRow, findCol,
  cellStr, cellNum, normalizeDate, canonicalizePerson,
  colLetter, parseTimeOrCode,
} from "./utils";
import type * as XLSX from "xlsx";

type WB = XLSX.WorkBook;
const SPECIAL_CODES = new Set(["n/a", "pto", "out sick"]);

function parseMMMDD(raw: string, year: number): string {
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const m = raw.trim().toLowerCase().match(/^([a-z]{3})\s+(\d{1,2})$/);
  if (!m) return "";
  const mm = months[m[1]];
  if (!mm) return "";
  return `${year}-${mm}-${m[2].padStart(2, "0")}`;
}

function parseTimeMins(s: string): number | null {
  const num = Number(s);
  if (!isNaN(num) && num >= 0 && num < 1.5) return Math.round(num * 24 * 60);
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3]) {
    const ap = m[3].toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  return h * 60 + min;
}

function computeHours(inStr: string, outStr: string): number | null {
  const tIn = parseTimeMins(inStr);
  const tOut = parseTimeMins(outStr);
  if (tIn == null || tOut == null) return null;
  let diff = tOut - tIn;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

// ── Helpers: dynamic sheet/year resolution ──────────────────────────────────

/** Find a sheet matching a pattern like /^Live - / and extract year from its name. */
function findSheet(wb: WB, prefix: RegExp): { name: string; year: number } | null {
  const sheet = (wb.SheetNames || []).find((n: string) => prefix.test(n));
  if (!sheet) return null;
  const ym = sheet.match(/(\d{4})/);
  const year = ym ? parseInt(ym[1], 10) : new Date().getFullYear();
  return { name: sheet, year };
}

// ── A. Live - <Mon> <Year> ──────────────────────────────────────────────────

function parseLiveAttendance(wb: WB, _errors: IngestError[]): AttendanceRow[] {
  const found = findSheet(wb, /^Live\s*-/i);
  if (!found) return [];
  const SHEET = found.name;
  const year = found.year;
  const rawHeaders = headerRow(wb, SHEET, 1);
  if (rawHeaders.length < 3) return [];
  const dayPairs: { date: string; inIdx: number; outIdx: number }[] = [];
  for (let c = 2; c < rawHeaders.length - 1; c += 2) {
    const inHeader = rawHeaders[c] || "";
    const match = inHeader.match(
      /^((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2})/,
    );
    if (match) {
      const dateStr = parseMMMDD(match[1], year);
      if (dateStr) dayPairs.push({ date: dateStr, inIdx: c, outIdx: c + 1 });
    }
  }
  const allRows = sheetRows(wb, SHEET, 2);
  const results: AttendanceRow[] = [];
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const excelRow = i + 3;
    const name = cellStr(row, 0);
    if (!name) continue;
    const project = cellStr(row, 1);
    for (const pair of dayPairs) {
      const rawIn = parseTimeOrCode(row[pair.inIdx]);
      const rawOut = parseTimeOrCode(row[pair.outIdx]);
      if (!rawIn && !rawOut) continue;
      const inLower = rawIn.toLowerCase();
      const outLower = rawOut.toLowerCase();
      let code = "";
      if (SPECIAL_CODES.has(inLower) || SPECIAL_CODES.has(outLower)) {
        code = (SPECIAL_CODES.has(inLower) ? rawIn : rawOut).toUpperCase();
      }
      let hours: number | null = null;
      if (!code && rawIn && rawOut) hours = computeHours(rawIn, rawOut);
      results.push({
        canonical_name: canonicalizePerson(name), default_project: project,
        work_date: pair.date, clock_in: rawIn, clock_out: rawOut,
        attendance_code: code || (hours != null ? "PRESENT" : ""),
        attendance_hours: hours, source_sheet: SHEET, source_row: excelRow,
        source_ref: `${colLetter(pair.inIdx)}${excelRow}:${colLetter(pair.outIdx)}${excelRow}`,
      });
    }
  }
  return results;
}

// ── B. Roster ────────────────────────────────────────────────────────────────

function parseRoster(wb: WB): Person[] {
  const SHEET = "Roster";
  const headers = headerRow(wb, SHEET, 1);
  if (headers.length === 0) return [];
  const col = (l: string) => findCol(headers, l);
  const allRows = sheetRows(wb, SHEET, 2);
  const results: Person[] = [];
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const excelRow = i + 3;
    const name = cellStr(row, col("staff name"));
    if (!name) continue;
    const activeRaw = cellStr(row, col("active?")).toLowerCase();
    results.push({
      canonical_name: canonicalizePerson(name),
      home_base: cellStr(row, col("home base")),
      consumed_availability: cellStr(row, col("consumed availability")),
      availability: cellStr(row, col("availability")),
      default_project: cellStr(row, col("default project")),
      secondary_project: cellStr(row, col("secondary project")),
      tertiary_project: cellStr(row, col("tertiary project")),
      quaternary_project: cellStr(row, col("quaternary project")),
      uid_northwell: cellStr(row, col("uid (northwell)")),
      uid_agilant: cellStr(row, col("uid (agilant)")),
      notes: cellStr(row, col("notes")),
      active: ["yes", "true", "y", "1"].includes(activeRaw),
      source_sheet: "Roster", source_row: excelRow,
    });
  }
  return results;
}


// ── C. Billing Detail - <Mon> <Year> ────────────────────────────────────────

function parseBillingDetail(wb: WB, _errors: IngestError[]): BillingDetailExisting[] {
  const found = findSheet(wb, /^Billing Detail\s*-/i);
  if (!found) return [];
  const SHEET = found.name;
  const headers = headerRow(wb, SHEET, 2);
  if (headers.length === 0) return [];
  const col = (l: string) => findCol(headers, l);
  const allRows = sheetRows(wb, SHEET, 3);
  const results: BillingDetailExisting[] = [];
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const excelRow = i + 4;
    const name = cellStr(row, col("staff name"));
    if (!name) continue;
    results.push({
      canonical_name: canonicalizePerson(name),
      work_date: normalizeDate(col("date") >= 0 ? row[col("date")] : ""),
      worked_project: cellStr(row, col("worked project")),
      billing_bucket: cellStr(row, col("billing bucket")),
      clock_in: col("clock in") >= 0 ? parseTimeOrCode(row[col("clock in")]) : "",
      clock_out: col("clock out") >= 0 ? parseTimeOrCode(row[col("clock out")]) : "",
      hours: cellNum(row, col("hours")),
      billable_flag: cellStr(row, col("billable flag")),
      source_ref: cellStr(row, col("source ref")),
      notes: cellStr(row, col("notes")),
      source_sheet: SHEET, source_row: excelRow,
    });
  }
  return results;
}

// ── D. Billing Summary - Mar 2026 ───────────────────────────────────────────

function parseBillingSummary(wb: WB): BillingSummaryExisting[] {
  const SHEET = "Billing Summary - Mar 2026";
  const headers = headerRow(wb, SHEET, 3); // header row 4 (0-based 3)
  if (headers.length === 0) return [];
  const allRows = sheetRows(wb, SHEET, 4);
  const results: BillingSummaryExisting[] = [];
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const excelRow = i + 5;
    const firstCell = cellStr(row, 0);
    if (!firstCell) continue;
    const raw: Record<string, unknown> = {};
    headers.forEach((h, idx) => { if (h) raw[h] = row[idx] ?? ""; });
    const hoursCol = findCol(headers, "total hours", "hours");
    results.push({
      bucket: firstCell,
      total_hours: cellNum(row, hoursCol >= 0 ? hoursCol : 1),
      source_sheet: SHEET, source_row: excelRow, raw_data: raw,
    });
  }
  return results;
}

// ── E. Bonitas Tracker - Mar 26 (internal manager copy) ─────────────────────

function parseBonitasTracker(wb: WB, _errors: IngestError[]): ManagerExistingRow[] {
  const SHEET = "Bonitas Tracker - Mar 26";
  const sheet = wb.Sheets[SHEET];
  if (!sheet) return [];

  // Header rows 1-2, data starts row 3 (0-based indices 0-1, data from 2)
  const allRaw: unknown[][] = sheetRows(wb, SHEET, 0);
  if (allRaw.length < 3) return [];

  // Use same day-block parser as manager workbook
  return parseDayBlockSheet(allRaw, SHEET, 2);
}

/** Shared day-block parser for Bonita-format sheets. */
export function parseDayBlockSheet(
  allRaw: unknown[][],
  sheetLabel: string,
  dataStart: number,
): ManagerExistingRow[] {
  const results: ManagerExistingRow[] = [];
  let currentDate = "";

  for (let i = dataStart; i < allRaw.length; i++) {
    const row = allRaw[i] as unknown[];
    const excelRow = i + 1; // 1-based
    const colA = cellStr(row, 0);

    // Detect day anchor: weekday label or actual date
    if (colA) {
      const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      if (weekdays.includes(colA.toLowerCase())) {
        // Next row might have actual date – peek ahead
        continue;
      }
      const maybeDate = normalizeDate(row[0]);
      if (maybeDate) {
        currentDate = maybeDate;
        // This row might also have tech data in columns B+
        const tech = cellStr(row, 1);
        if (!tech) continue;
      }
    }

    const tech = cellStr(row, 1);
    if (!tech || !currentDate) continue;

    results.push({
      work_date: currentDate,
      canonical_name: canonicalizePerson(tech),
      clock_in: parseTimeOrCode(row[2]),
      clock_out: parseTimeOrCode(row[3]),
      hours: cellNum(row, 4),
      outward_project: cellStr(row, 5),
      outward_assignment: cellStr(row, 6),
      source_sheet: sheetLabel,
      source_row: excelRow,
    });
  }
  return results;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function extractRosterBilling(filePath: string): RosterBillingResult {
  const wb = readWorkbook(filePath);
  const errors: IngestError[] = [];

  return {
    people: parseRoster(wb),
    attendance: parseLiveAttendance(wb, errors),
    billing_detail_existing: parseBillingDetail(wb, errors),
    billing_summary_existing: parseBillingSummary(wb),
    manager_internal_existing: parseBonitasTracker(wb, errors),
    errors,
  };
}