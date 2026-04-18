/**
 * Reconciliation engine
 *
 * Implements the 7 reconciliation rules from the extractor spec, plus optional
 * Teams deployment-chat presence rules:
 *   1. Daily Narrative + Event Log decide what work happened
 *   2. Live - Mar 2026 decides presence window and cap
 *   3. Billing Detail is reviewed internal layer, not raw truth
 *   4. Neuron Track hours is export format only
 *   5. Task evidence exists but no attendance → flag exception
 *   6. Attendance exists but no task evidence → flag exception
 *   7. Multi-bucket splits only from explicit Event Log rows or reviewed override
 *   8. (optional) Teams presence but no roster attendance → flag
 *   9. (optional, strict) Teams presence but no task evidence → flag
 */
import type {
  TaskEvidenceDaily,
  TaskEvidenceEvent,
  AttendanceRow,
  BillingDetailExisting,
  ReconciliationException,
  ReconciliationResult,
  TeamsPresenceRow,
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
  /**
   * Optional person-date presence rows derived from Microsoft Teams
   * deployment chats (e.g. chats named `NSUH - 4/11/2026`). Enables
   * the `teams_presence_no_attendance` rule. If omitted, Teams rules
   * are skipped and behavior is identical to the original extractor.
   */
  teams_presence?: TeamsPresenceRow[];
  /**
   * When true, also flag Teams presence with no task evidence
   * (Daily Narrative / Event Log). Defaults to false because chat
   * membership is a softer signal than roster attendance.
   */
  strict_teams_presence?: boolean;
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

  // ── Teams presence rules (optional) ────────────────────────────────────
  // Build a de-duplicated set of Teams presence person-days and keep a
  // representative row per key for contextual exception details.
  const teamsDays = new Set<PersonDate>();
  const teamsRowByKey = new Map<PersonDate, TeamsPresenceRow>();
  if (params.teams_presence && params.teams_presence.length > 0) {
    for (const row of params.teams_presence) {
      if (!row.canonical_name || !row.work_date) continue;
      const k = key(row.canonical_name, row.work_date);
      teamsDays.add(k);
      if (!teamsRowByKey.has(k)) teamsRowByKey.set(k, row);
    }

    // Rule 8: Teams presence but no roster attendance
    for (const pd of teamsDays) {
      if (attendanceDays.has(pd)) continue;
      const [name, date] = pd.split("\x00");
      const representative = teamsRowByKey.get(pd);
      const topic = representative?.chat_topic ?? "";
      exceptions.push({
        work_date: date,
        canonical_name: name,
        exception_type: "teams_presence_no_attendance",
        detail: `${name} was a member of deployment chat${topic ? ` "${topic}"` : ""} on ${date} but has no roster attendance hours`,
        evidence_sources: ["Microsoft Teams deployment chat"],
      });
    }

    // Rule 9 (opt-in): Teams presence but no task evidence
    if (params.strict_teams_presence) {
      for (const pd of teamsDays) {
        if (evidenceDays.has(pd)) continue;
        const [name, date] = pd.split("\x00");
        const representative = teamsRowByKey.get(pd);
        const topic = representative?.chat_topic ?? "";
        exceptions.push({
          work_date: date,
          canonical_name: name,
          exception_type: "teams_presence_no_task_evidence",
          detail: `${name} was a member of deployment chat${topic ? ` "${topic}"` : ""} on ${date} but has no Daily Narrative / Event Log evidence`,
          evidence_sources: ["Microsoft Teams deployment chat"],
        });
      }
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

