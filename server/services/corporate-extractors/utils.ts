/**
 * Shared utilities for corporate workflow extractors.
 */
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM-safe __dirname equivalent
const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = path.dirname(__filename_esm);

// ── CSV helper ───────────────────────────────────────────────────────────────

/** Parse a single CSV line respecting double-quoted fields. */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ── Person alias map ─────────────────────────────────────────────────────────
// Loaded from shared CSV at tools/billing_bridge/config/person_aliases.csv
// so both TS extractors and Python billing bridge use the same source of truth.
// Falls back to a hardcoded map if the CSV is not found.

const SHARED_ALIASES_PATH = path.resolve(
  __dirname_esm, "../../../tools/billing_bridge/config/person_aliases.csv",
);

function loadAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    const csv = fs.readFileSync(SHARED_ALIASES_PATH, "utf-8");
    const lines = csv.split(/\r?\n/).filter(Boolean);
    // Skip header: alias_name,canonical_name,source_system
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length >= 2) {
        const alias = cols[0].trim().toLowerCase();
        const canonical = cols[1].trim();
        if (alias && canonical) map[alias] = canonical;
      }
    }
  } catch {
    // CSV not found — use hardcoded fallback
    const fallback: [string, string][] = [
      ["richard perez", "Rich Perez"],
      ["rich perez", "Rich Perez"],
      ["khalida abdul-rahman", "Khalida Abdul-Rahman"],
      ["khalida abdulrahman", "Khalida Abdul-Rahman"],
      ["christopher cummings", "Chris Cummings"],
      ["chris cummings", "Chris Cummings"],
      ["emmanuel sanchez", "Emmanuel Sanchez"],
      ["manny sanchez", "Emmanuel Sanchez"],
    ];
    for (const [k, v] of fallback) map[k] = v;
  }
  return map;
}

const PERSON_ALIAS_MAP = loadAliasMap();

export function canonicalizePerson(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const key = trimmed.toLowerCase();
  return PERSON_ALIAS_MAP[key] ?? trimmed;
}

// ── Excel date helpers ───────────────────────────────────────────────────────

/**
 * Safely convert an Excel serial date OR a string date to ISO yyyy-mm-dd.
 * Handles mixed string/datetime dates as spec requires.
 */
export function normalizeDate(raw: unknown): string {
  if (raw == null || raw === "") return "";

  // Excel serial number
  if (typeof raw === "number" && raw > 0) {
    return excelSerialToISODate(raw);
  }

  // Already a Date object (xlsx can return these with cellDates: true)
  if (raw instanceof Date) {
    return formatDateISO(raw);
  }

  // String date – try parsing
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    // Try ISO-ish patterns first
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return formatDateISO(d);
    }

    // Try MM/DD/YYYY
    const mdy = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
    if (mdy) {
      const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
      const month = mdy[1].padStart(2, "0");
      const day = mdy[2].padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  return "";
}

export function excelSerialToISODate(serial: number): string {
  const utcDays = Math.floor(serial) - 25569;
  const d = new Date(utcDays * 86400 * 1000);
  return formatDateISO(d);
}

function formatDateISO(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ── Cell helpers ─────────────────────────────────────────────────────────────

/** Read a cell value from a row array, returning "" for missing/null. */
export function cell(row: unknown[], idx: number): unknown {
  if (idx < 0 || idx >= row.length) return "";
  const v = row[idx];
  return v == null ? "" : v;
}

/** Read a cell as a trimmed string. */
export function cellStr(row: unknown[], idx: number): string {
  const v = cell(row, idx);
  return String(v).trim();
}

/** Read a cell as a number or null. */
export function cellNum(row: unknown[], idx: number): number | null {
  const v = cell(row, idx);
  if (v === "" || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ── Workbook helpers ─────────────────────────────────────────────────────────

/** Read a workbook from a file path (server-side, using fs). */
export function readWorkbook(filePath: string): XLSX.WorkBook {
  const buffer = fs.readFileSync(filePath);
  return XLSX.read(buffer, { type: "buffer", cellDates: false, cellNF: false, cellText: false });
}

/**
 * Get raw rows from a sheet as an array of arrays.
 * `startRow` is 0-based index of the first data row to return.
 */
export function sheetRows(wb: XLSX.WorkBook, sheetName: string, startRow = 0): unknown[][] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  // IMPORTANT: `raw: true` forces xlsx to return raw cell values (.v) instead
  // of pre-formatted strings (.w). This means time cells come back as fractional
  // day numbers (e.g. 0.333 for 8:00 AM) instead of locale-formatted strings.
  // We handle all formatting ourselves in parseTimeOrCode / normalizeDate.
  const all: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  return startRow > 0 ? all.slice(startRow) : all;
}

/**
 * Get header row from a sheet (0-based index).
 * Returns lowercase trimmed strings.
 */
export function headerRow(wb: XLSX.WorkBook, sheetName: string, rowIndex: number): string[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const all: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rowIndex >= all.length) return [];
  return (all[rowIndex] || []).map((h) => String(h ?? "").trim().toLowerCase());
}

/**
 * Find the column index for a header label (case-insensitive match).
 * Returns -1 if not found.
 */
export function findCol(headers: string[], ...labels: string[]): number {
  for (const label of labels) {
    const lc = label.toLowerCase();
    const idx = headers.findIndex((h) => h === lc);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Convert a column index to an Excel column letter (0 -> A, 25 -> Z, 26 -> AA). */
export function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/**
 * Convert an Excel fractional-day number to "H:MM AM/PM".
 * 0.333… → "8:00 AM", 0.708… → "5:00 PM"
 */
export function excelFractionToTime(frac: number): string {
  const totalMinutes = Math.round(frac * 24 * 60);
  let h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Parse a time value to a human-readable string.
 * Handles:
 *   - Excel fractional day (0 < n < 1.5) → "H:MM AM/PM"
 *   - Already-formatted "8:00 AM" or "14:30" → pass through
 *   - Special codes "PTO", "N/A", "OUT SICK" → pass through uppercase
 */
export function parseTimeOrCode(raw: unknown): string {
  if (raw == null || raw === "") return "";

  // Excel fractional day number
  if (typeof raw === "number") {
    if (raw > 0 && raw < 1.5) return excelFractionToTime(raw);
    return String(raw);
  }

  const s = String(raw).trim();
  if (!s) return "";

  // If it looks like a fractional number in string form
  const asNum = Number(s);
  if (!isNaN(asNum) && asNum > 0 && asNum < 1.5) {
    return excelFractionToTime(asNum);
  }

  return s;
}

