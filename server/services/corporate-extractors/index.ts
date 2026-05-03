/**
 * Corporate workflow extractors – barrel export.
 *
 * Three workbook extractors + reconciliation engine.
 *
 * Usage:
 *   import {
 *     extractTaskTracker,
 *     extractRosterBilling,
 *     extractManagerWorkbook,
 *     reconcile,
 *   } from "./services/corporate-extractors";
 */

// Extractors
export { extractTaskTracker } from "./task-tracker-extractor";
export { extractRosterBilling } from "./roster-billing-extractor";
export { extractManagerWorkbook } from "./manager-workbook-extractor";

// Reconciliation
export { reconcile } from "./reconcile";

// Contributions engine
export { buildContributions, OUTWARD_MAPPINGS } from "./contributions-engine";

// Utilities (available for custom use / testing)
export { canonicalizePerson, normalizeDate, excelFractionToTime } from "./utils";

// Teams deployment-chat snapshot normalization
export { normalizeTeamsSnapshot } from "./teams-snapshot";
export type { NormalizedTeamsSnapshot } from "./teams-snapshot";

// All types
export type {
  // Ingest
  IngestError,
  // Task tracker tables
  TaskEvidenceDaily,
  TaskEvidenceEvent,
  TaskCatalogEntry,
  // Roster / billing tables
  Person,
  AttendanceRow,
  BillingDetailExisting,
  BillingSummaryExisting,
  // Manager workbook tables
  ManagerExistingRow,
  ValidationList,
  // Contributions engine
  ContributionCategory,
  FieldInsightRow,
  ExperienceLedgerRow,
  AssignmentEvidenceRow,
  ContributionsResult,
  OutwardMapping,
  // Manual overrides (governance)
  ManualOverride,
  // Reconciliation
  ReconciliationException,
  // Teams deployment-chat presence
  TeamsPresenceRow,
  TeamsPresenceSnapshot,
  // Result shapes
  TaskTrackerResult,
  RosterBillingResult,
  ManagerWorkbookResult,
  ReconciliationResult,
} from "./types";

