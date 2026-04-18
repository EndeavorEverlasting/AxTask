import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";
import type {
  AttendanceRow,
  TaskEvidenceDaily,
  TaskEvidenceEvent,
  TeamsPresenceRow,
} from "./types";

function attendance(
  name: string,
  date: string,
  hours: number | null = 8,
  code = "PRESENT",
): AttendanceRow {
  return {
    canonical_name: name,
    default_project: "",
    work_date: date,
    clock_in: "",
    clock_out: "",
    attendance_code: code,
    attendance_hours: hours,
    source_sheet: "Live - Apr 2026",
    source_row: 1,
    source_ref: "",
  };
}

function daily(name: string, date: string): TaskEvidenceDaily {
  return {
    work_date: date,
    canonical_name: name,
    site: "",
    raw_workstream: "",
    notes: "",
    record_state: "",
    evidence_source: "Daily Narrative Log",
    source_sheet: "Daily Narrative Log",
    source_row: 1,
  };
}

function teamsRow(
  name: string,
  date: string,
  topic = "NSUH - 4/11/2026",
): TeamsPresenceRow {
  return {
    work_date: date,
    canonical_name: name,
    chat_topic: topic,
    chat_id: "19:abc@thread.v2",
    evidence_source: "teams_deployment_chat",
  };
}

describe("reconcile — teams_presence rules", () => {
  it("behaves identically to base engine when teams_presence is omitted", () => {
    const result = reconcile({
      task_evidence_daily: [daily("Alejandro Perez", "2026-04-11")],
      task_evidence_event: [],
      attendance: [],
      billing_detail_existing: [],
    });

    const types = result.exceptions.map(e => e.exception_type).sort();
    expect(types).toEqual(["task_evidence_no_attendance"]);
    expect(
      result.exceptions.some(e => e.exception_type === "teams_presence_no_attendance"),
    ).toBe(false);
  });

  it("flags teams_presence_no_attendance when chat member has no roster hours", () => {
    const result = reconcile({
      task_evidence_daily: [],
      task_evidence_event: [],
      attendance: [],
      billing_detail_existing: [],
      teams_presence: [teamsRow("Alejandro Perez", "2026-04-11")],
    });

    expect(result.exceptions).toHaveLength(1);
    const ex = result.exceptions[0];
    expect(ex.exception_type).toBe("teams_presence_no_attendance");
    expect(ex.canonical_name).toBe("Alejandro Perez");
    expect(ex.work_date).toBe("2026-04-11");
    expect(ex.detail).toContain("NSUH - 4/11/2026");
    expect(ex.evidence_sources).toContain("Microsoft Teams deployment chat");
  });

  it("does not flag teams_presence_no_attendance when roster attendance exists", () => {
    const result = reconcile({
      task_evidence_daily: [],
      task_evidence_event: [],
      attendance: [attendance("Alejandro Perez", "2026-04-11", 8)],
      billing_detail_existing: [],
      teams_presence: [teamsRow("Alejandro Perez", "2026-04-11")],
    });

    expect(
      result.exceptions.some(e => e.exception_type === "teams_presence_no_attendance"),
    ).toBe(false);
  });

  it("de-duplicates multiple Teams rows for the same person-date", () => {
    const result = reconcile({
      task_evidence_daily: [],
      task_evidence_event: [],
      attendance: [],
      billing_detail_existing: [],
      teams_presence: [
        teamsRow("Alejandro Perez", "2026-04-11", "NSUH - 4/11/2026"),
        teamsRow("Alejandro Perez", "2026-04-11", "NSUH swing team - 4/11/2026"),
      ],
    });

    const teamsExceptions = result.exceptions.filter(
      e => e.exception_type === "teams_presence_no_attendance",
    );
    expect(teamsExceptions).toHaveLength(1);
  });

  it("strict_teams_presence also flags missing task evidence", () => {
    const result = reconcile({
      task_evidence_daily: [],
      task_evidence_event: [],
      attendance: [attendance("Alejandro Perez", "2026-04-11", 8)],
      billing_detail_existing: [],
      teams_presence: [teamsRow("Alejandro Perez", "2026-04-11")],
      strict_teams_presence: true,
    });

    expect(
      result.exceptions.some(
        e => e.exception_type === "teams_presence_no_task_evidence"
          && e.canonical_name === "Alejandro Perez"
          && e.work_date === "2026-04-11",
      ),
    ).toBe(true);
  });

  it("without strict flag, no teams_presence_no_task_evidence is produced", () => {
    const result = reconcile({
      task_evidence_daily: [],
      task_evidence_event: [],
      attendance: [attendance("Alejandro Perez", "2026-04-11", 8)],
      billing_detail_existing: [],
      teams_presence: [teamsRow("Alejandro Perez", "2026-04-11")],
    });

    expect(
      result.exceptions.some(e => e.exception_type === "teams_presence_no_task_evidence"),
    ).toBe(false);
  });

  it("ignores teams rows missing canonical_name or work_date", () => {
    const result = reconcile({
      task_evidence_daily: [],
      task_evidence_event: [],
      attendance: [],
      billing_detail_existing: [],
      teams_presence: [
        { ...teamsRow("Alejandro Perez", "2026-04-11"), canonical_name: "" },
        { ...teamsRow("Alejandro Perez", "2026-04-11"), work_date: "" },
      ] as TeamsPresenceRow[],
    });

    expect(result.exceptions).toHaveLength(0);
  });

  it("PTO roster row is NOT treated as attendance and Teams rule still flags", () => {
    const result = reconcile({
      task_evidence_daily: [],
      task_evidence_event: [],
      attendance: [attendance("Alejandro Perez", "2026-04-11", null, "PTO")],
      billing_detail_existing: [],
      teams_presence: [teamsRow("Alejandro Perez", "2026-04-11")],
    });

    expect(
      result.exceptions.some(e => e.exception_type === "teams_presence_no_attendance"),
    ).toBe(true);
  });
});

describe("reconcile — preserves existing rules when teams_presence provided", () => {
  it("still emits task_evidence_no_attendance from evidence-only person-days", () => {
    const evt: TaskEvidenceEvent = {
      work_date: "2026-04-11",
      week_start: "2026-04-06",
      canonical_name: "Valentin Nikoliuk",
      site: "",
      room_area: "",
      case_id: "",
      normalized_workstream: "",
      event_type: "",
      task_category: "",
      quantity: null,
      unit_type: "",
      window_code: "",
      std_hours_per_unit: null,
      fixed_overhead_hours: null,
      complexity_factor: null,
      disruption_factor: null,
      travel_hours: null,
      modeled_hours: null,
      suggested_hours: null,
      actual_billed_hours: null,
      variance_hours: null,
      billable_flag: "",
      narrative_tag: "",
      primary_hostname: "",
      related_asset_hostname: "",
      evidence_source_detail: "",
      notes: "",
      source_sheet: "Event Log",
      source_row: 1,
    };

    const result = reconcile({
      task_evidence_daily: [],
      task_evidence_event: [evt],
      attendance: [],
      billing_detail_existing: [],
      teams_presence: [],
    });

    expect(
      result.exceptions.some(e => e.exception_type === "task_evidence_no_attendance"),
    ).toBe(true);
  });
});
