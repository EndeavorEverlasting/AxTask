/**
 * Shared Task Tracker → AxTask G1 dry-run seam (design prototype).
 *
 * Owns header-aware row parsing and disposition classification only.
 * Does not create AxTask tasks, call Google APIs, or claim A3 idempotency.
 * Formula-owned Priority/Score columns are ignored as task-authority inputs.
 */

export const SHARED_TASK_TRACKER_ACTIVE_ROW_MIN = 2;
export const SHARED_TASK_TRACKER_ACTIVE_ROW_MAX = 24996;
export const SHARED_TASK_TRACKER_LEGACY_BOUNDARY_ROW = 24997;

export const TRACKER_REQUIRED_HEADERS = [
  "date",
  "activity",
  "taskid",
] as const;

/** Headers resolved when present; absence is not a hard fail except required. */
export const TRACKER_OPTIONAL_HEADERS = [
  "result",
  "notes",
  "urgency",
  "impact",
  "effort",
  "domain",
  "tags",
  "manual override",
  "manualoverride",
] as const;

/** Never treated as create-task authority inputs. */
export const TRACKER_FORMULA_OWNED_HEADERS = ["priority", "score"] as const;

export type TrackerDryRunDisposition =
  | "create"
  | "already_imported"
  | "invalid"
  | "legacy_excluded"
  | "needs_review";

export type TrackerSourceRegion = "active" | "legacy";

export interface TrackerSourceIdentity {
  provider: string;
  bindingId: string;
  sourceTaskId: string;
}

export interface TrackerSourceRecord {
  identity: TrackerSourceIdentity;
  spreadsheetRow: number;
  region: TrackerSourceRegion;
  date: string | null;
  activity: string;
  notes: string;
  completed: boolean;
  urgency: number | null;
  impact: number | null;
  effort: number | null;
  domain: string | null;
  tags: string | null;
  manualOverride: string | null;
}

export interface TrackerDryRunRowResult {
  disposition: TrackerDryRunDisposition;
  spreadsheetRow: number;
  reason: string;
  record?: TrackerSourceRecord;
  /** Present when TaskID parsed even for non-create dispositions. */
  sourceTaskId?: string;
}

export interface TrackerDryRunReport {
  ok: boolean;
  headerError?: string;
  results: TrackerDryRunRowResult[];
  counts: Record<TrackerDryRunDisposition, number>;
}

export interface TrackerImportReceiptPort {
  /**
   * True when this source identity already has a durable AxTask receipt.
   * Stubbed at the prototype boundary; G2 wires A3/receipt storage here.
   */
  hasImportedSourceIdentity(identity: TrackerSourceIdentity): boolean;
}

export interface DryRunTrackerRowsInput {
  provider: string;
  bindingId: string;
  /** Row 0 = header cells; subsequent rows are data. */
  rows: unknown[][];
  /**
   * Spreadsheet row number of `rows[0]` (header). Daily Planner uses 1.
   * Data row i maps to spreadsheetRow = headerSpreadsheetRow + i.
   */
  headerSpreadsheetRow?: number;
  receipts: TrackerImportReceiptPort;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cell(row: unknown[], index: number | undefined): string {
  if (index === undefined || index < 0) return "";
  const raw = row[index];
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "boolean") return raw ? "true" : "false";
  return String(raw).trim();
}

function parseCompleted(value: string): boolean {
  const v = value.toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "checked";
}

function parseScore1to5(value: string): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((c) => String(c ?? "").trim() === "");
}

function emptyCounts(): Record<TrackerDryRunDisposition, number> {
  return {
    create: 0,
    already_imported: 0,
    invalid: 0,
    legacy_excluded: 0,
    needs_review: 0,
  };
}

function resolveHeaderMap(headerRow: unknown[]): {
  map: Map<string, number>;
  missingRequired: string[];
} {
  const map = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (key && !map.has(key)) map.set(key, i);
  });

  const missingRequired: string[] = [];
  for (const required of TRACKER_REQUIRED_HEADERS) {
    if (!map.has(required)) missingRequired.push(required);
  }
  return { map, missingRequired };
}

function headerIndex(map: Map<string, number>, ...aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const idx = map.get(normalizeHeader(alias));
    if (idx !== undefined) return idx;
  }
  return undefined;
}

function classifyRegion(spreadsheetRow: number): TrackerSourceRegion {
  return spreadsheetRow >= SHARED_TASK_TRACKER_LEGACY_BOUNDARY_ROW ? "legacy" : "active";
}

/**
 * Build the stable source identity key G2 will hand to A3.
 * Mutable title/date/notes are intentionally excluded.
 */
export function buildTrackerSourceIdentityKey(identity: TrackerSourceIdentity): string {
  return [
    identity.provider.trim().toLowerCase(),
    identity.bindingId.trim(),
    identity.sourceTaskId.trim(),
  ].join("\u0001");
}

/**
 * Pure G1 dry-run: header contract → per-row dispositions.
 * Does not mutate AxTask or the spreadsheet.
 */
export function dryRunTrackerRows(input: DryRunTrackerRowsInput): TrackerDryRunReport {
  const counts = emptyCounts();
  const headerSpreadsheetRow = input.headerSpreadsheetRow ?? 1;

  if (!input.provider.trim() || !input.bindingId.trim()) {
    return {
      ok: false,
      headerError: "provider and bindingId are required (private binding; never hard-code in fixtures as live IDs)",
      results: [],
      counts,
    };
  }

  if (!input.rows.length) {
    return {
      ok: false,
      headerError: "header row is required",
      results: [],
      counts,
    };
  }

  const { map, missingRequired } = resolveHeaderMap(input.rows[0] ?? []);
  if (missingRequired.length > 0) {
    return {
      ok: false,
      headerError: `missing required headers: ${missingRequired.join(", ")}`,
      results: [],
      counts,
    };
  }

  const dateIdx = headerIndex(map, "date")!;
  const activityIdx = headerIndex(map, "activity")!;
  const taskIdIdx = headerIndex(map, "taskid")!;
  const resultIdx = headerIndex(map, "result");
  const notesIdx = headerIndex(map, "notes");
  const urgencyIdx = headerIndex(map, "urgency");
  const impactIdx = headerIndex(map, "impact");
  const effortIdx = headerIndex(map, "effort");
  const domainIdx = headerIndex(map, "domain");
  const tagsIdx = headerIndex(map, "tags");
  const manualIdx = headerIndex(map, "manual override", "manualoverride");

  const results: TrackerDryRunRowResult[] = [];
  /** First spreadsheet row that formed a complete source identity in this dry-run batch. */
  const seenIdentityRows = new Map<string, number>();

  for (let i = 1; i < input.rows.length; i += 1) {
    const row = input.rows[i] ?? [];
    const spreadsheetRow = headerSpreadsheetRow + i;

    if (isBlankRow(row)) continue;

    const region = classifyRegion(spreadsheetRow);
    const sourceTaskId = cell(row, taskIdIdx);
    const activity = cell(row, activityIdx);
    const dateRaw = cell(row, dateIdx);

    if (region === "legacy") {
      const result: TrackerDryRunRowResult = {
        disposition: "legacy_excluded",
        spreadsheetRow,
        reason: `row ${spreadsheetRow} is at or beyond legacy boundary ${SHARED_TASK_TRACKER_LEGACY_BOUNDARY_ROW}`,
        sourceTaskId: sourceTaskId || undefined,
      };
      counts.legacy_excluded += 1;
      results.push(result);
      continue;
    }

    if (!sourceTaskId) {
      const result: TrackerDryRunRowResult = {
        disposition: "invalid",
        spreadsheetRow,
        reason: "missing source TaskID",
      };
      counts.invalid += 1;
      results.push(result);
      continue;
    }

    if (!activity) {
      const result: TrackerDryRunRowResult = {
        disposition: "invalid",
        spreadsheetRow,
        reason: "missing Activity",
        sourceTaskId,
      };
      counts.invalid += 1;
      results.push(result);
      continue;
    }

    if (spreadsheetRow < SHARED_TASK_TRACKER_ACTIVE_ROW_MIN || spreadsheetRow > SHARED_TASK_TRACKER_ACTIVE_ROW_MAX) {
      const result: TrackerDryRunRowResult = {
        disposition: "invalid",
        spreadsheetRow,
        reason: `row ${spreadsheetRow} is outside active region ${SHARED_TASK_TRACKER_ACTIVE_ROW_MIN}-${SHARED_TASK_TRACKER_ACTIVE_ROW_MAX}`,
        sourceTaskId,
      };
      counts.invalid += 1;
      results.push(result);
      continue;
    }

    const identity: TrackerSourceIdentity = {
      provider: input.provider.trim(),
      bindingId: input.bindingId.trim(),
      sourceTaskId,
    };

    const identityKey = buildTrackerSourceIdentityKey(identity);
    const firstRowForIdentity = seenIdentityRows.get(identityKey);
    if (firstRowForIdentity !== undefined) {
      const result: TrackerDryRunRowResult = {
        disposition: "needs_review",
        spreadsheetRow,
        reason: `duplicate source TaskID in dry-run batch; first seen at row ${firstRowForIdentity}`,
        sourceTaskId,
      };
      counts.needs_review += 1;
      results.push(result);
      continue;
    }
    seenIdentityRows.set(identityKey, spreadsheetRow);

    const record: TrackerSourceRecord = {
      identity,
      spreadsheetRow,
      region,
      date: dateRaw || null,
      activity,
      notes: cell(row, notesIdx),
      completed: parseCompleted(cell(row, resultIdx)),
      urgency: parseScore1to5(cell(row, urgencyIdx)),
      impact: parseScore1to5(cell(row, impactIdx)),
      effort: parseScore1to5(cell(row, effortIdx)),
      domain: cell(row, domainIdx) || null,
      tags: cell(row, tagsIdx) || null,
      manualOverride: cell(row, manualIdx) || null,
    };

    // Date missing → needs_review (not invent today); matches operator date-only caution.
    if (!dateRaw) {
      const result: TrackerDryRunRowResult = {
        disposition: "needs_review",
        spreadsheetRow,
        reason: "missing Date; refuse blank-date invent-today in dry-run",
        record,
        sourceTaskId,
      };
      counts.needs_review += 1;
      results.push(result);
      continue;
    }

    if (input.receipts.hasImportedSourceIdentity(identity)) {
      const result: TrackerDryRunRowResult = {
        disposition: "already_imported",
        spreadsheetRow,
        reason: "source TaskID already has an import receipt",
        record,
        sourceTaskId,
      };
      counts.already_imported += 1;
      results.push(result);
      continue;
    }

    const result: TrackerDryRunRowResult = {
      disposition: "create",
      spreadsheetRow,
      reason: "eligible for reviewed create_task apply",
      record,
      sourceTaskId,
    };
    counts.create += 1;
    results.push(result);
  }

  return { ok: true, results, counts };
}

/** In-memory receipt port for prototype / unit tests. */
export function createMemoryReceiptPort(
  imported: Iterable<TrackerSourceIdentity> = [],
): TrackerImportReceiptPort {
  const keys = new Set(
    [...imported].map((identity) => buildTrackerSourceIdentityKey(identity)),
  );
  return {
    hasImportedSourceIdentity(identity) {
      return keys.has(buildTrackerSourceIdentityKey(identity));
    },
  };
}
