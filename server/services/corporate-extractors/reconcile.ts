/**
 * Reconciliation engine
 *
 * Implements the 7 reconciliation rules from the extractor spec:
 *   1. Daily Narrative + Event Log decide what work happened
 *   2. Live - Mar 2026 decides presence window and cap
 *   3. Billing Detail is reviewed internal layer, not raw truth
 *   4. Neuron Track hours is export format only
 *   5. Task evidence exists but no attendance → flag exception
 *   6. Attendance exists but no task evidence → flag exception
 *   7. Multi-bucket splits only from explicit Event Log rows or reviewed override
 */
import type {
  TaskEvidenceDaily,
  TaskEvidenceEvent,
  AttendanceRow,
  BillingDetailExisting,
  ReconciliationException,
  ReconciliationResult,
} from "./types";

type PersonDate = string; // "canonical_name\0yyyy-mm-dd"

function key(name: string, date: string): PersonDate {
  return `${name}\x00${date}`;
}

export function reconcile(params: {
  task_evidence_daily: TaskEvidenceDaily[];
  task_evidence_event: TaskEvidenceEvent[];
  attendance: AttendanceRow[];
  billing_detail_existing: BillingDetailExisting[];
}): ReconciliationResult {
  const exceptions: ReconciliationException[] = [];

  // Build person+date sets from each source
  const evidenceDays = new Set<PersonDate>();
  const attendanceDays = new Set<PersonDate>();
  const billingDays = new Map<PersonDate, BillingDetailExisting[]>();

  for (const row of params.task_evidence_daily) {
    evidenceDays.add(key(row.canonical_name, row.work_date));
  }
  for (const row of params.task_evidence_event) {
    evidenceDays.add(key(row.canonical_name, row.work_date));
  }
  for (const row of params.attendance) {
    if (row.attendance_code === "PTO" || row.attendance_code === "OUT SICK") continue;
    if (row.attendance_hours != null && row.attendance_hours > 0) {
      attendanceDays.add(key(row.canonical_name, row.work_date));
    }
  }
  for (const row of params.billing_detail_existing) {
    const k = key(row.canonical_name, row.work_date);
    if (!billingDays.has(k)) billingDays.set(k, []);
    billingDays.get(k)!.push(row);
  }

  // Rule 5: task evidence exists but no attendance
  for (const pd of evidenceDays) {
    if (!attendanceDays.has(pd)) {
      const [name, date] = pd.split("\x00");
      exceptions.push({
        work_date: date,
        canonical_name: name,
        exception_type: "task_evidence_no_attendance",
        detail: `Task evidence found for ${name} on ${date} but no clean attendance record`,
        evidence_sources: ["Daily Narrative Log", "Event Log"],
      });
    }
  }

  // Rule 6: attendance exists but no task evidence
  for (const pd of attendanceDays) {
    if (!evidenceDays.has(pd)) {
      const [name, date] = pd.split("\x00");
      exceptions.push({
        work_date: date,
        canonical_name: name,
        exception_type: "attendance_no_task_evidence",
        detail: `Attendance found for ${name} on ${date} but no task evidence`,
        evidence_sources: ["Live - Mar 2026"],
      });
    }
  }

  // ── Allocation rules (ported from tools/billing_bridge/config/allocation_rules.yaml) ──
  // Build per-person-date category sets from event log evidence
  const eventDayCats = new Map<PersonDate, Set<string>>();
  for (const row of params.task_evidence_event) {
    const k = key(row.canonical_name, row.work_date);
    if (!eventDayCats.has(k)) eventDayCats.set(k, new Set());
    const cat = row.normalized_workstream || row.task_category || row.event_type || "";
    if (cat) eventDayCats.get(k)!.add(cat);
  }

  // Rule 7: multi-bucket splits must have explicit Event Log rows
  for (const [pd, billingRows] of billingDays) {
    const buckets = new Set(billingRows.map((r: BillingDetailExisting) => r.billing_bucket).filter(Boolean));
    if (buckets.size <= 1) continue;

    const eventWorkstreams = eventDayCats.get(pd);
    if (!eventWorkstreams || eventWorkstreams.size < buckets.size) {
      const [name, date] = pd.split("\x00");
      exceptions.push({
        work_date: date,
        canonical_name: name,
        exception_type: "split_unsupported",
        detail: `Billing shows ${buckets.size} buckets [${[...buckets].join(", ")}] for ${name} on ${date} but Event Log has ${eventWorkstreams?.size ?? 0} workstreams`,
        evidence_sources: ["Billing Detail - Mar 2026", "Event Log"],
      });
    }
  }

  // Allocation rule: multi_supported_category → require_review
  // If a matched day has >1 distinct task categories from event evidence,
  // it requires review instead of auto-allocation.
  for (const pd of evidenceDays) {
    if (!attendanceDays.has(pd)) continue; // already flagged as no-attendance
    const cats = eventDayCats.get(pd);
    if (cats && cats.size > 1) {
      const [name, date] = pd.split("\x00");
      exceptions.push({
        work_date: date,
        canonical_name: name,
        exception_type: "multiple_categories_same_day",
        detail: `${name} on ${date} has ${cats.size} distinct categories [${[...cats].join(", ")}] — requires review for allocation split`,
        evidence_sources: ["Event Log"],
      });
    }
  }

  // Summary
  const matchedDays = new Set<PersonDate>();
  for (const pd of evidenceDays) {
    if (attendanceDays.has(pd)) matchedDays.add(pd);
  }

  return {
    exceptions,
    summary: {
      total_attendance_days: attendanceDays.size,
      total_evidence_days: evidenceDays.size,
      matched_days: matchedDays.size,
      exception_count: exceptions.length,
    },
  };
}

