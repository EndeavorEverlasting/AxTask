/**
 * Corporate workflow extractor types.
 *
 * These interfaces define the normalized output tables emitted by the three
 * workbook extractors (task-tracker, roster-billing, manager-workbook).
 */

// ── Ingest metadata ──────────────────────────────────────────────────────────

export interface IngestError {
  source_sheet: string;
  source_row: number;
  field: string;
  message: string;
  raw_value?: unknown;
}

// ── Task Tracker tables ──────────────────────────────────────────────────────

export interface TaskEvidenceDaily {
  work_date: string;          // ISO date yyyy-mm-dd
  canonical_name: string;
  site: string;
  raw_workstream: string;
  notes: string;              // raw Method / Detail
  record_state: string;
  evidence_source: "Daily Narrative Log";
  source_sheet: "Daily Narrative Log";
  source_row: number;
}

export interface TaskEvidenceEvent {
  work_date: string;
  week_start: string;
  canonical_name: string;
  site: string;
  room_area: string;
  case_id: string;
  normalized_workstream: string;
  event_type: string;
  task_category: string;
  quantity: number | null;
  unit_type: string;
  window_code: string;
  std_hours_per_unit: number | null;
  fixed_overhead_hours: number | null;
  complexity_factor: number | null;
  disruption_factor: number | null;
  travel_hours: number | null;
  modeled_hours: number | null;
  suggested_hours: number | null;
  actual_billed_hours: number | null;
  variance_hours: number | null;
  billable_flag: string;
  narrative_tag: string;
  primary_hostname: string;
  related_asset_hostname: string;
  evidence_source_detail: string;
  notes: string;
  source_sheet: "Event Log";
  source_row: number;
}

export interface TaskCatalogEntry {
  task_category: string;
  default_workstream: string;
  unit_type: string;
  default_window_code: string;
  std_hours_per_unit: number | null;
  fixed_overhead_hours: number | null;
  default_complexity_factor: number | null;
  default_disruption_factor: number | null;
  default_billable_flag: string;
  kpi_friendly: string;
  description: string;
  source_sheet: "Task Catalog";
  source_row: number;
}

// ── Roster / Billing tables ──────────────────────────────────────────────────

export interface Person {
  canonical_name: string;
  home_base: string;
  consumed_availability: string;
  availability: string;
  default_project: string;
  secondary_project: string;
  tertiary_project: string;
  quaternary_project: string;
  uid_northwell: string;
  uid_agilant: string;
  notes: string;
  active: boolean;
  source_sheet: "Roster";
  source_row: number;
}

export interface AttendanceRow {
  canonical_name: string;
  default_project: string;
  work_date: string;
  clock_in: string;
  clock_out: string;
  attendance_code: string;      // "PRESENT" | "PTO" | "OUT SICK" | "N/A" | ""
  attendance_hours: number | null;
  source_sheet: string;
  source_row: number;
  source_ref: string;           // cell pair reference for forensic trace
}

export interface BillingDetailExisting {
  canonical_name: string;
  work_date: string;
  worked_project: string;
  billing_bucket: string;
  clock_in: string;
  clock_out: string;
  hours: number | null;
  billable_flag: string;
  source_ref: string;
  notes: string;
  source_sheet: string;
  source_row: number;
}

export interface BillingSummaryExisting {
  bucket: string;
  total_hours: number | null;
  source_sheet: string;
  source_row: number;
  raw_data: Record<string, unknown>;
}

// ── Manager workbook tables ──────────────────────────────────────────────────

export interface ManagerExistingRow {
  work_date: string;
  canonical_name: string;
  clock_in: string;
  clock_out: string;
  hours: number | null;
  outward_project: string;
  outward_assignment: string;
  source_sheet: string;
  source_row: number;
}


// ── Teams presence (Microsoft Graph deployment chat sweep) ──────────────────
// A person-date row asserting that someone was a member of a dated deployment
// group chat (e.g. "NSUH - 4/11/2026"). This is an attendance *signal*, not
// a clock-in/out record, and is never written back to billing automatically.

export interface TeamsPresenceRow {
  work_date: string;                 // ISO yyyy-mm-dd parsed from chat topic
  canonical_name: string;            // after canonicalizePerson()
  raw_display_name?: string;         // original Teams display name
  chat_topic: string;                // e.g. "NSUH - 4/11/2026"
  chat_id?: string;                  // opaque Graph chat id
  evidence_source: "teams_deployment_chat";
}

export interface TeamsPresenceSnapshot {
  generated_at: string;              // ISO datetime
  topic_pattern?: string;            // regex used by the sweep
  tool_version?: string;             // browser sweep / native sweep version tag
  rows: TeamsPresenceRow[];
}

// ── Reconciliation ───────────────────────────────────────────────────────────

export interface ReconciliationException {
  work_date: string;
  canonical_name: string;
  exception_type:
    | "task_evidence_no_attendance"
    | "attendance_no_task_evidence"
    | "split_unsupported"
    | "billing_mismatch"
    | "multiple_categories_same_day"
    | "teams_presence_no_attendance"
    | "teams_presence_no_task_evidence"
    | "other";
  detail: string;
  evidence_sources: string[];
}

// ── Extractor return shapes ──────────────────────────────────────────────────

export interface TaskTrackerResult {
  task_evidence_daily: TaskEvidenceDaily[];
  task_evidence_event: TaskEvidenceEvent[];
  task_catalog: TaskCatalogEntry[];
  errors: IngestError[];
}

export interface RosterBillingResult {
  people: Person[];
  attendance: AttendanceRow[];
  billing_detail_existing: BillingDetailExisting[];
  billing_summary_existing: BillingSummaryExisting[];
  manager_internal_existing: ManagerExistingRow[];
  errors: IngestError[];
}

export interface ManagerWorkbookResult {
  manager_existing_rows: ManagerExistingRow[];
  validation_lists: ValidationList;
  errors: IngestError[];
}

export interface ReconciliationResult {
  exceptions: ReconciliationException[];
  summary: {
    total_attendance_days: number;
    total_evidence_days: number;
    matched_days: number;
    exception_count: number;
  };
}
export interface ValidationList {
  tech_names: string[];
  time_values: string[];
  assignment_types: string[];
}

// ── Internal contribution taxonomy ──────────────────────────────────────────
// This is the "operational truth" vocabulary that replaces "Neuron Installation"
// with what actually happened.

export type ContributionCategory =
  | "Deployment"
  | "Troubleshooting"
  | "Training / Enablement"
  | "Validation / Testing"
  | "Repurposing / Reallocation"
  | "Incident Response"
  | "Logistics / Disposal"
  | "Documentation / Survey"
  | "Production Support"
  | "Staging / Count"
  | "Reimage Support"
  | "Workflow Continuity"
  | "Other";

// ── Companion layer A: Field Insights ──────────────────────────────────────
// One row per meaningful operational contribution

export interface FieldInsightRow {
  work_date: string;
  canonical_name: string;
  site: string;
  workstream: string;
  contribution_category: ContributionCategory;
  operational_insight: string;       // human-readable sentence describing what happened
  evidence_source: string;           // "Daily Narrative Log" | "Event Log" | "Billing Detail"
  evidence_row: number;              // source row for traceability
  notes: string;
}

// ── Companion layer B: Experience Ledger ───────────────────────────────────
// One row per tech per skill/action demonstrated — the resume-protecting layer

export interface ExperienceLedgerRow {
  canonical_name: string;
  work_date: string;
  experience_type: string;           // e.g. "COM-port issue isolation", "SIS Offline Viewer troubleshooting"
  contribution_category: ContributionCategory;
  context: string;                   // site, project, what was happening
  source_log: string;                // which log it came from
  source_row: number;
  notes: string;
}

// ── Companion layer C: Assignment Evidence ─────────────────────────────────
// One row per outward Bonita row showing what supports it — the anti-bullshit layer

export interface AssignmentEvidenceRow {
  canonical_name: string;
  work_date: string;
  outward_assignment: string;        // what Bonita's sheet says (e.g. "Neuron Installation")
  outward_project: string;           // Bonita project bucket
  supporting_daily_log_rows: number[];   // source_row refs into Daily Narrative Log
  supporting_event_log_rows: number[];   // source_row refs into Event Log
  supporting_billing_detail_row: number | null; // source_row ref into Billing Detail
  actual_categories: ContributionCategory[];    // what really happened
  exception_flag: boolean;           // true if outward assignment doesn't match evidence
  exception_detail: string;          // explanation of mismatch
}

// ── Contributions engine result shape ──────────────────────────────────────

export interface ContributionsResult {
  field_insights: FieldInsightRow[];
  experience_ledger: ExperienceLedgerRow[];
  assignment_evidence: AssignmentEvidenceRow[];
  errors: IngestError[];
}

// ── Outward assignment mapping ─────────────────────────────────────────────
// Maps many internal categories → one Bonita-facing bucket

export interface OutwardMapping {
  outward_assignment: string;        // e.g. "Neuron Installation"
  internal_categories: ContributionCategory[];
}

// ── Manual overrides (governance lane) ───────────────────────────────────────

export interface ManualOverride {
  work_date: string;
  canonical_name: string;
  override_type: string;
  old_value: string;
  new_value: string;
  reason: string;
  approved_by: string;
  evidence_note: string;
  entered_at: string;           // ISO datetime
}

