/**
 * Technician hours report — normalized rows + aggregates for Excel export.
 */
import type {
  AttendanceRow,
  BillingDetailExisting,
  ManagerExistingRow,
  Person,
} from "./types";
import { canonicalizePerson } from "./utils";

export type HourSourceLabel = "Live attendance" | "Billing Detail" | "Manager";

export interface UnifiedDetailRow {
  canonical_name: string;
  work_date: string;
  project: string;
  hours: number | null;
  clock_in: string;
  clock_out: string;
  source: HourSourceLabel;
  source_sheet: string;
  source_row: number;
  source_ref: string;
  extra: string;
}

export interface TechnicianHoursParams {
  attendance: AttendanceRow[];
  billing_detail_existing: BillingDetailExisting[];
  manager_existing_rows: ManagerExistingRow[];
  people: Person[];
  /** Match roster name; optional if projectFilter lists technicians only */
  technicianQuery: string;
  projectFilter: string;
  /** yyyy-mm */
  month: string;
  focusStart: string;
  focusEnd: string;
  /** Original upload filenames for Meta */
  fileNames?: { taskTracker?: string; roster?: string; manager?: string };
}

export interface TechnicianHoursReport {
  meta: {
    generatedAtIso: string;
    resolvedTechnician: string | null;
    projectFilter: string;
    month: string;
    focusStart: string;
    focusEnd: string;
    detailSheetsIncluded: boolean;
    notes: string[];
  };
  /** Single technician: one row per project. Multi mode: empty. */
  byProjectSingle: { project: string; aprilHours: number; focusHours: number }[];
  /** Project-only multi-person: person + project breakdown */
  byProjectRoster: { canonical_name: string; project: string; aprilHours: number; focusHours: number }[];
  aprilDetail: UnifiedDetailRow[];
  focusDetail: UnifiedDetailRow[];
}

function trimLower(s: string): string {
  return s.trim().toLowerCase();
}

/** Person row matches project substring (any slot). */
export function personMatchesProjectFilter(p: Person, filter: string): boolean {
  const f = trimLower(filter);
  if (!f) return true;
  const slots = [
    p.default_project,
    p.secondary_project,
    p.tertiary_project,
    p.quaternary_project,
  ];
  return slots.some((slot) => trimLower(slot).includes(f));
}

/** Resolve user input to roster canonical_name. */
export function resolveTechnicianName(query: string, people: Person[]): string | null {
  const q = query.trim();
  if (!q) return null;
  const canonQ = canonicalizePerson(q);
  const lc = canonQ.toLowerCase();

  for (const p of people) {
    if (p.canonical_name === canonQ) return p.canonical_name;
  }
  for (const p of people) {
    if (p.canonical_name.toLowerCase() === lc) return p.canonical_name;
  }
  for (const p of people) {
    if (p.canonical_name.toLowerCase().includes(lc)) return p.canonical_name;
  }
  return null;
}

export function dateInMonth(workDate: string, month: string): boolean {
  const m = month.trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return false;
  return workDate.startsWith(`${m}-`) || workDate.startsWith(m);
}

export function dateInRangeInclusive(workDate: string, start: string, end: string): boolean {
  if (!workDate || !start || !end) return false;
  return workDate >= start && workDate <= end;
}

function rowHours(h: number | null): number {
  if (h == null || Number.isNaN(h)) return 0;
  return h;
}

function pushAttendance(
  out: UnifiedDetailRow[],
  rows: AttendanceRow[],
  name: string,
): void {
  for (const r of rows) {
    if (r.canonical_name !== name) continue;
    const extra =
      r.attendance_code && r.attendance_code !== "PRESENT" ? r.attendance_code : "";
    out.push({
      canonical_name: r.canonical_name,
      work_date: r.work_date,
      project: r.default_project || "",
      hours: r.attendance_hours,
      clock_in: r.clock_in,
      clock_out: r.clock_out,
      source: "Live attendance",
      source_sheet: r.source_sheet,
      source_row: r.source_row,
      source_ref: r.source_ref,
      extra,
    });
  }
}

function pushBilling(out: UnifiedDetailRow[], rows: BillingDetailExisting[], name: string): void {
  for (const r of rows) {
    if (r.canonical_name !== name) continue;
    out.push({
      canonical_name: r.canonical_name,
      work_date: r.work_date,
      project: r.worked_project || "",
      hours: r.hours,
      clock_in: r.clock_in,
      clock_out: r.clock_out,
      source: "Billing Detail",
      source_sheet: r.source_sheet,
      source_row: r.source_row,
      source_ref: r.source_ref || "",
      extra: "",
    });
  }
}

function pushManager(out: UnifiedDetailRow[], rows: ManagerExistingRow[], name: string): void {
  for (const r of rows) {
    if (r.canonical_name !== name) continue;
    out.push({
      canonical_name: r.canonical_name,
      work_date: r.work_date,
      project: r.outward_project || "",
      hours: r.hours,
      clock_in: r.clock_in,
      clock_out: r.clock_out,
      source: "Manager",
      source_sheet: r.source_sheet,
      source_row: r.source_row,
      source_ref: `row ${r.source_row}`,
      extra: r.outward_assignment || "",
    });
  }
}

export function buildUnifiedDetailRows(
  name: string,
  attendance: AttendanceRow[],
  billing: BillingDetailExisting[],
  manager: ManagerExistingRow[],
): UnifiedDetailRow[] {
  const out: UnifiedDetailRow[] = [];
  pushAttendance(out, attendance, name);
  pushBilling(out, billing, name);
  pushManager(out, manager, name);
  out.sort((a, b) => {
    const c = a.work_date.localeCompare(b.work_date);
    if (c !== 0) return c;
    const order = (s: HourSourceLabel) =>
      s === "Live attendance" ? 0 : s === "Billing Detail" ? 1 : 2;
    return order(a.source) - order(b.source);
  });
  return out;
}

function sumByProject(rows: UnifiedDetailRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = r.project || "(blank)";
    m.set(key, (m.get(key) ?? 0) + rowHours(r.hours));
  }
  return m;
}

function mergeProjectMaps(
  april: Map<string, number>,
  focus: Map<string, number>,
): { project: string; aprilHours: number; focusHours: number }[] {
  const projects = new Set<string>([...april.keys(), ...focus.keys()]);
  return [...projects]
    .sort((a, b) => a.localeCompare(b))
    .map((project) => ({
      project,
      aprilHours: april.get(project) ?? 0,
      focusHours: focus.get(project) ?? 0,
    }));
}

export function buildTechnicianHoursReport(params: TechnicianHoursParams): TechnicianHoursReport {
  const notes: string[] = [];
  const generatedAtIso = new Date().toISOString();
  const { month, focusStart, focusEnd, people } = params;

  const techQ = params.technicianQuery.trim();
  const projF = params.projectFilter.trim();

  let resolvedFromQuery: string | null = techQ ? resolveTechnicianName(techQ, people) : null;
  if (techQ && !resolvedFromQuery) {
    notes.push(`No roster match for technician query "${techQ}".`);
  }

  const peopleForProjectOnly = projF
    ? people.filter((p) => personMatchesProjectFilter(p, projF))
    : [];

  /** Unambiguous single person for project-only filter */
  let effectiveTechnician = resolvedFromQuery;
  if (!effectiveTechnician && projF && peopleForProjectOnly.length === 1) {
    effectiveTechnician = peopleForProjectOnly[0].canonical_name;
    notes.push(
      `Only one roster match for project filter; using "${effectiveTechnician}" for detail sheets.`,
    );
  }

  if (resolvedFromQuery) {
    const person = people.find((p) => p.canonical_name === resolvedFromQuery);
    if (person && projF && !personMatchesProjectFilter(person, projF)) {
      notes.push(
        "Resolved technician does not match project filter (check roster project slots).",
      );
    }
  }

  const personObj = effectiveTechnician
    ? people.find((p) => p.canonical_name === effectiveTechnician)
    : undefined;
  const passesProjectFilter =
    !projF || (personObj ? personMatchesProjectFilter(personObj, projF) : false);

  const singleTechMode = !!effectiveTechnician && passesProjectFilter;

  const rosterMulti =
    !singleTechMode && !!projF && peopleForProjectOnly.length > 1;

  let byProjectSingle: { project: string; aprilHours: number; focusHours: number }[] = [];
  let byProjectRoster: {
    canonical_name: string;
    project: string;
    aprilHours: number;
    focusHours: number;
  }[] = [];

  let aprilDetail: UnifiedDetailRow[] = [];
  let focusDetail: UnifiedDetailRow[] = [];
  let detailSheetsIncluded = false;

  if (singleTechMode && effectiveTechnician) {
    const all = buildUnifiedDetailRows(
      effectiveTechnician,
      params.attendance,
      params.billing_detail_existing,
      params.manager_existing_rows,
    );
    const aprilRows = all.filter((r) => dateInMonth(r.work_date, month));
    const focusRows = all.filter((r) => dateInRangeInclusive(r.work_date, focusStart, focusEnd));
    byProjectSingle = mergeProjectMaps(sumByProject(aprilRows), sumByProject(focusRows));
    aprilDetail = aprilRows;
    focusDetail = focusRows;
    detailSheetsIncluded = true;
    notes.push("Detail rows include Live attendance, Billing Detail, and Manager sources as separate lines.");
  } else if (rosterMulti) {
    detailSheetsIncluded = false;
    notes.push(
      "Multiple roster matches for project filter — detail sheets omitted. Pick one technician by name to export row-level traces.",
    );
    for (const p of peopleForProjectOnly) {
      const all = buildUnifiedDetailRows(
        p.canonical_name,
        params.attendance,
        params.billing_detail_existing,
        params.manager_existing_rows,
      );
      const aprilRows = all.filter((r) => dateInMonth(r.work_date, month));
      const focusRows = all.filter((r) => dateInRangeInclusive(r.work_date, focusStart, focusEnd));
      const aprilMap = sumByProject(aprilRows);
      const focusMap = sumByProject(focusRows);
      const projects = new Set<string>([...aprilMap.keys(), ...focusMap.keys()]);
      for (const project of [...projects].sort()) {
        byProjectRoster.push({
          canonical_name: p.canonical_name,
          project,
          aprilHours: aprilMap.get(project) ?? 0,
          focusHours: focusMap.get(project) ?? 0,
        });
      }
    }
  } else if (effectiveTechnician && !singleTechMode) {
    notes.push("Detail not exported: project filter excludes resolved technician.");
  }

  return {
    meta: {
      generatedAtIso,
      resolvedTechnician: effectiveTechnician,
      projectFilter: projF,
      month,
      focusStart,
      focusEnd,
      detailSheetsIncluded,
      notes,
    },
    byProjectSingle,
    byProjectRoster,
    aprilDetail,
    focusDetail,
  };
}

export function validateHoursReportParams(body: {
  month?: string;
  focusStart?: string;
  focusEnd?: string;
}): { ok: true } | { ok: false; message: string } {
  const { month, focusStart, focusEnd } = body;
  if (!month || !/^\d{4}-\d{2}$/.test(month.trim())) {
    return { ok: false, message: "month is required (yyyy-mm)" };
  }
  if (!focusStart || !/^\d{4}-\d{2}-\d{2}$/.test(focusStart.trim())) {
    return { ok: false, message: "focusStart is required (yyyy-mm-dd)" };
  }
  if (!focusEnd || !/^\d{4}-\d{2}-\d{2}$/.test(focusEnd.trim())) {
    return { ok: false, message: "focusEnd is required (yyyy-mm-dd)" };
  }
  if (focusStart > focusEnd) {
    return { ok: false, message: "focusStart must be on or before focusEnd" };
  }
  return { ok: true };
}
