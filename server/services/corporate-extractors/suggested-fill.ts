/**
 * Suggested-fill export.
 *
 * Given reconciliation exceptions that indicate "someone was present (Teams
 * chat or roster attendance) but the Task Tracker has no evidence for that
 * day", generate review-only row suggestions using the Task Catalog defaults
 * from `task_tracker_extractor`.
 *
 * This is intentionally **not** written back to any workbook automatically:
 * the output is a CSV / JSON the user downloads and reviews. Every row is
 * labeled `requires_review: true`.
 */

import type {
  ReconciliationException,
  TaskCatalogEntry,
  TeamsPresenceRow,
} from "./types";

export interface SuggestedFillRow {
  work_date: string;
  canonical_name: string;
  site: string;                  // best-effort inference from chat topic
  task_category: string;         // default from selection
  default_workstream: string;    // from task catalog
  unit_type: string;
  quantity: number | null;
  std_hours_per_unit: number | null;
  suggested_hours: number | null;
  billable_flag: string;
  evidence_source: string;       // "teams_deployment_chat" | "roster_attendance_only"
  evidence_detail: string;       // chat topic or attendance note
  requires_review: true;
  reason: string;                // why we're suggesting this
}

export interface BuildSuggestedFillInput {
  exceptions: ReconciliationException[];
  task_catalog: TaskCatalogEntry[];
  teams_presence?: TeamsPresenceRow[];
  /** Category name to use as the safe default. */
  defaultTaskCategory?: string;
  /** Fallback hours when the catalog entry has no std_hours_per_unit. */
  fallbackHours?: number;
}

const DEFAULT_TASK_CATEGORY = "Device Configuration";
const DEFAULT_FALLBACK_HOURS = 8;

function findCatalogEntry(
  catalog: TaskCatalogEntry[],
  name: string,
): TaskCatalogEntry | null {
  const lc = name.trim().toLowerCase();
  return catalog.find(c => c.task_category.trim().toLowerCase() === lc) ?? null;
}

function siteFromChatTopic(topic?: string): string {
  if (!topic) return "";
  // Conventional pattern: "<SITE> - MM/DD/YYYY" or "<SITE> team - MM/DD/YYYY"
  const parts = topic.split(/\s*-\s*/);
  if (parts.length >= 2) return parts[0].trim();
  return "";
}

/**
 * Build suggested review-only fill rows.
 *
 * The function processes two exception types:
 *   - `teams_presence_no_attendance`   → uses `teams_presence` index to pull chat topic
 *   - `task_evidence_no_attendance`    → plain "no evidence" rows
 *
 * Deduplicates on (canonical_name, work_date) — at most one suggestion per
 * person-day since we cannot know splits without further review.
 */
export function buildSuggestedFill(input: BuildSuggestedFillInput): SuggestedFillRow[] {
  const category = input.defaultTaskCategory ?? DEFAULT_TASK_CATEGORY;
  const fallback = input.fallbackHours ?? DEFAULT_FALLBACK_HOURS;
  const catalogEntry = findCatalogEntry(input.task_catalog, category);

  // Index teams rows by (canonical_name, work_date) → first matching row
  const teamsIdx = new Map<string, TeamsPresenceRow>();
  for (const row of input.teams_presence ?? []) {
    const k = `${row.canonical_name}\x00${row.work_date}`;
    if (!teamsIdx.has(k)) teamsIdx.set(k, row);
  }

  const seen = new Set<string>();
  const out: SuggestedFillRow[] = [];

  for (const ex of input.exceptions) {
    const eligible =
      ex.exception_type === "teams_presence_no_attendance"
      || ex.exception_type === "teams_presence_no_task_evidence"
      || ex.exception_type === "task_evidence_no_attendance";
    if (!eligible) continue;

    const key = `${ex.canonical_name}\x00${ex.work_date}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const teamsRow = teamsIdx.get(key);
    const site = teamsRow ? siteFromChatTopic(teamsRow.chat_topic) : "";
    const stdHours = catalogEntry?.std_hours_per_unit ?? null;
    const suggestedHours = stdHours != null ? stdHours : fallback;

    let evidenceSource = "roster_attendance_only";
    let evidenceDetail = ex.detail;
    if (ex.exception_type === "teams_presence_no_attendance"
      || ex.exception_type === "teams_presence_no_task_evidence") {
      evidenceSource = "teams_deployment_chat";
      evidenceDetail = teamsRow?.chat_topic ?? ex.detail;
    }

    out.push({
      work_date: ex.work_date,
      canonical_name: ex.canonical_name,
      site,
      task_category: category,
      default_workstream: catalogEntry?.default_workstream ?? "",
      unit_type: catalogEntry?.unit_type ?? "",
      quantity: null,
      std_hours_per_unit: stdHours,
      suggested_hours: suggestedHours,
      billable_flag: catalogEntry?.default_billable_flag ?? "",
      evidence_source: evidenceSource,
      evidence_detail: evidenceDetail,
      requires_review: true,
      reason: ex.exception_type,
    });
  }

  return out;
}

/** CSV-escape a single field. */
function csvField(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function suggestedFillToCsv(rows: SuggestedFillRow[]): string {
  const headers: (keyof SuggestedFillRow)[] = [
    "work_date",
    "canonical_name",
    "site",
    "task_category",
    "default_workstream",
    "unit_type",
    "quantity",
    "std_hours_per_unit",
    "suggested_hours",
    "billable_flag",
    "evidence_source",
    "evidence_detail",
    "requires_review",
    "reason",
  ];
  const lines: string[] = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map(h => csvField(r[h])).join(","));
  }
  return lines.join("\r\n");
}
