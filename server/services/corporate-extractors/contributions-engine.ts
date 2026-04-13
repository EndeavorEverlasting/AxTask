/**
 * Contributions engine
 *
 * Transforms raw task evidence (Daily Narrative, Event Log, Billing Detail)
 * into three companion layers:
 *   A. Field Insights        – operational truth per contribution
 *   B. Experience Ledger     – resume-protecting skill evidence
 *   C. Assignment Evidence   – anti-bullshit linkage from Bonita rows to real work
 *
 * This is the missing tooth in the gear train: the system that prevents
 * "Neuron Installation" from erasing real field experience.
 */
import type {
  TaskEvidenceDaily,
  TaskEvidenceEvent,
  BillingDetailExisting,
  ManagerExistingRow,
  FieldInsightRow,
  ExperienceLedgerRow,
  AssignmentEvidenceRow,
  ContributionsResult,
  ContributionCategory,
  OutwardMapping,
  IngestError,
} from "./types";

// ── Category inference ──────────────────────────────────────────────────────
// Maps keywords found in workstream/notes/event_type to the internal taxonomy.

const CATEGORY_KEYWORDS: [RegExp, ContributionCategory][] = [
  [/troubleshoot|debug|diagnos|com.?port|offline viewer|sis offline/i, "Troubleshooting"],
  [/incident|break.?fix|emergency|outage|down/i, "Incident Response"],
  [/reimage|re-image|wipe|rebuild/i, "Reimage Support"],
  [/repurpos|relabel|realloc|swap|reassign device/i, "Repurposing / Reallocation"],
  [/valid|test|qa|verify|production test|acceptance/i, "Validation / Testing"],
  [/train|onboard|mentor|enablement|shadow/i, "Training / Enablement"],
  [/stag|count|reconcil|inventory/i, "Staging / Count"],
  [/logistic|dispos|transport|deliver|pickup/i, "Logistics / Disposal"],
  [/document|survey|audit|report/i, "Documentation / Survey"],
  [/deploy|install|provision|setup|commission/i, "Deployment"],
  [/workflow continuity|field continuity/i, "Workflow Continuity"],
  [/production support|support|continuity|workflow/i, "Production Support"],
];

function inferCategory(text: string): ContributionCategory {
  const combined = text.toLowerCase();
  for (const [pattern, category] of CATEGORY_KEYWORDS) {
    if (pattern.test(combined)) return category;
  }
  return "Other";
}

function inferFromEvidence(row: { raw_workstream?: string; notes?: string; event_type?: string; task_category?: string; normalized_workstream?: string }): ContributionCategory {
  const parts = [
    row.raw_workstream ?? "",
    row.notes ?? "",
    row.event_type ?? "",
    row.task_category ?? "",
    row.normalized_workstream ?? "",
  ].join(" ");
  return inferCategory(parts);
}

// ── A. Field Insights ───────────────────────────────────────────────────────

function buildFieldInsights(
  daily: TaskEvidenceDaily[],
  events: TaskEvidenceEvent[],
): FieldInsightRow[] {
  const results: FieldInsightRow[] = [];

  for (const row of daily) {
    const cat = inferFromEvidence(row);
    results.push({
      work_date: row.work_date,
      canonical_name: row.canonical_name,
      site: row.site,
      workstream: row.raw_workstream,
      contribution_category: cat,
      operational_insight: row.notes || row.raw_workstream || "",
      evidence_source: "Daily Narrative Log",
      evidence_row: row.source_row,
      notes: "",
    });
  }

  for (const row of events) {
    const cat = inferFromEvidence(row);
    results.push({
      work_date: row.work_date,
      canonical_name: row.canonical_name,
      site: row.site,
      workstream: row.normalized_workstream,
      contribution_category: cat,
      operational_insight: [row.event_type, row.task_category, row.notes].filter(Boolean).join(" — "),
      evidence_source: "Event Log",
      evidence_row: row.source_row,
      notes: row.narrative_tag || "",
    });
  }

  return results;
}

// ── B. Experience Ledger ────────────────────────────────────────────────────

function buildExperienceLedger(
  daily: TaskEvidenceDaily[],
  events: TaskEvidenceEvent[],
): ExperienceLedgerRow[] {
  // Deduplicate: one entry per (person, date, category) combo
  const seen = new Set<string>();
  const results: ExperienceLedgerRow[] = [];

  function addEntry(name: string, date: string, cat: ContributionCategory, experienceType: string, context: string, sourceLog: string, sourceRow: number, notes: string) {
    const key = `${name}|${date}|${cat}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      canonical_name: name, work_date: date, experience_type: experienceType,
      contribution_category: cat, context, source_log: sourceLog,
      source_row: sourceRow, notes,
    });
  }

  for (const row of daily) {
    const cat = inferFromEvidence(row);
    const expType = row.raw_workstream || cat;
    addEntry(row.canonical_name, row.work_date, cat, expType,
      `${row.site} — ${row.raw_workstream}`.trim(),
      "Daily Narrative Log", row.source_row, row.notes);
  }

  for (const row of events) {
    const cat = inferFromEvidence(row);
    const expType = row.task_category || row.event_type || cat;
    addEntry(row.canonical_name, row.work_date, cat, expType,
      `${row.site} — ${row.normalized_workstream} — ${row.event_type}`.trim(),
      "Event Log", row.source_row, row.notes);
  }

  return results;
}



// ── C. Assignment Evidence ──────────────────────────────────────────────────

function buildAssignmentEvidence(
  daily: TaskEvidenceDaily[],
  events: TaskEvidenceEvent[],
  billingDetail: BillingDetailExisting[],
  managerRows: ManagerExistingRow[],
): AssignmentEvidenceRow[] {
  // Index daily/event rows by person+date for fast lookup
  const dailyIndex = new Map<string, TaskEvidenceDaily[]>();
  for (const row of daily) {
    const k = `${row.canonical_name}|${row.work_date}`;
    if (!dailyIndex.has(k)) dailyIndex.set(k, []);
    dailyIndex.get(k)!.push(row);
  }
  const eventIndex = new Map<string, TaskEvidenceEvent[]>();
  for (const row of events) {
    const k = `${row.canonical_name}|${row.work_date}`;
    if (!eventIndex.has(k)) eventIndex.set(k, []);
    eventIndex.get(k)!.push(row);
  }
  const billingIndex = new Map<string, BillingDetailExisting>();
  for (const row of billingDetail) {
    const k = `${row.canonical_name}|${row.work_date}`;
    if (!billingIndex.has(k)) billingIndex.set(k, row); // first match
  }

  const results: AssignmentEvidenceRow[] = [];

  for (const mgr of managerRows) {
    const k = `${mgr.canonical_name}|${mgr.work_date}`;
    const dailyMatches = dailyIndex.get(k) ?? [];
    const eventMatches = eventIndex.get(k) ?? [];
    const billingMatch = billingIndex.get(k) ?? null;

    // Determine actual categories from evidence
    const actualCats = new Set<ContributionCategory>();
    for (const d of dailyMatches) actualCats.add(inferFromEvidence(d));
    for (const e of eventMatches) actualCats.add(inferFromEvidence(e));

    const outward = mgr.outward_assignment || mgr.outward_project || "";
    const hasEvidence = dailyMatches.length > 0 || eventMatches.length > 0;

    // Exception: outward says one thing, evidence says richer things
    const isCompressed = hasEvidence && actualCats.size > 1 &&
      /neuron|install/i.test(outward);
    const noEvidence = !hasEvidence && !!mgr.canonical_name;

    results.push({
      canonical_name: mgr.canonical_name,
      work_date: mgr.work_date,
      outward_assignment: outward,
      outward_project: mgr.outward_project,
      supporting_daily_log_rows: dailyMatches.map(d => d.source_row),
      supporting_event_log_rows: eventMatches.map(e => e.source_row),
      supporting_billing_detail_row: billingMatch?.source_row ?? null,
      actual_categories: [...actualCats],
      exception_flag: !!(isCompressed || noEvidence),
      exception_detail: isCompressed
        ? `Outward says "${outward}" but evidence shows: ${[...actualCats].join(", ")}`
        : noEvidence
          ? `No task evidence found for this outward assignment`
          : "",
    });
  }

  return results;
}

// ── Outward mapping: many internal → one Bonita bucket ──────────────────────
// Loaded from shared CSV at tools/billing_bridge/config/outward_assignment_map.csv
// so both TS and Python use the same mapping.

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname_ce = path.dirname(fileURLToPath(import.meta.url));

const OUTWARD_MAP_CSV = path.resolve(
  __dirname_ce, "../../../tools/billing_bridge/config/outward_assignment_map.csv",
);

function loadOutwardMappings(): OutwardMapping[] {
  const byAssignment = new Map<string, Set<string>>();
  try {
    const csv = fs.readFileSync(OUTWARD_MAP_CSV, "utf-8");
    const lines = csv.split(/\r?\n/).filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length >= 3) {
        const cat = cols[0].trim();
        const assignment = cols[2].trim();
        if (!byAssignment.has(assignment)) byAssignment.set(assignment, new Set());
        byAssignment.get(assignment)!.add(cat);
      }
    }
  } catch {
    // Fallback
    byAssignment.set("Neuron Installation", new Set([
      "Deployment", "Troubleshooting", "Validation / Testing",
      "Repurposing / Reallocation", "Incident Response",
      "Reimage Support", "Production Support", "Workflow Continuity", "Other",
    ]));
    byAssignment.set("Delivery / Transport / Disposal", new Set(["Logistics / Disposal", "Staging / Count"]));
    byAssignment.set("Training / Enablement", new Set(["Training / Enablement"]));
    byAssignment.set("Documentation / Survey", new Set(["Documentation / Survey"]));
  }

  return [...byAssignment.entries()].map(([assignment, cats]) => ({
    outward_assignment: assignment,
    internal_categories: [...cats] as ContributionCategory[],
  }));
}

export const OUTWARD_MAPPINGS: OutwardMapping[] = loadOutwardMappings();

// ── Public API ──────────────────────────────────────────────────────────────

export function buildContributions(params: {
  task_evidence_daily: TaskEvidenceDaily[];
  task_evidence_event: TaskEvidenceEvent[];
  billing_detail_existing: BillingDetailExisting[];
  manager_existing_rows: ManagerExistingRow[];
}): ContributionsResult {
  const errors: IngestError[] = [];

  return {
    field_insights: buildFieldInsights(
      params.task_evidence_daily,
      params.task_evidence_event,
    ),
    experience_ledger: buildExperienceLedger(
      params.task_evidence_daily,
      params.task_evidence_event,
    ),
    assignment_evidence: buildAssignmentEvidence(
      params.task_evidence_daily,
      params.task_evidence_event,
      params.billing_detail_existing,
      params.manager_existing_rows,
    ),
    errors,
  };
}

export { inferCategory, inferFromEvidence };