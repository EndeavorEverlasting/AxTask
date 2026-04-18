import { describe, expect, it } from "vitest";
import {
  buildSuggestedFill,
  suggestedFillToCsv,
} from "./suggested-fill";
import type {
  ReconciliationException,
  TaskCatalogEntry,
  TeamsPresenceRow,
} from "./types";

const catalog: TaskCatalogEntry[] = [
  {
    task_category: "Device Configuration",
    default_workstream: "Deployment",
    unit_type: "device",
    default_window_code: "",
    std_hours_per_unit: 0.5,
    fixed_overhead_hours: null,
    default_complexity_factor: null,
    default_disruption_factor: null,
    default_billable_flag: "billable",
    kpi_friendly: "",
    description: "",
    source_sheet: "Task Catalog",
    source_row: 1,
  },
];

const teamsRows: TeamsPresenceRow[] = [
  {
    work_date: "2026-04-11",
    canonical_name: "Alejandro Perez",
    chat_topic: "NSUH - 4/11/2026",
    chat_id: "c1",
    evidence_source: "teams_deployment_chat",
  },
];

function ex(
  type: ReconciliationException["exception_type"],
  name: string,
  date: string,
): ReconciliationException {
  return {
    work_date: date,
    canonical_name: name,
    exception_type: type,
    detail: `${name} on ${date}`,
    evidence_sources: [],
  };
}

describe("buildSuggestedFill", () => {
  it("produces one reviewable row per teams_presence_no_attendance exception", () => {
    const rows = buildSuggestedFill({
      exceptions: [ex("teams_presence_no_attendance", "Alejandro Perez", "2026-04-11")],
      task_catalog: catalog,
      teams_presence: teamsRows,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      work_date: "2026-04-11",
      canonical_name: "Alejandro Perez",
      site: "NSUH",
      task_category: "Device Configuration",
      default_workstream: "Deployment",
      unit_type: "device",
      std_hours_per_unit: 0.5,
      suggested_hours: 0.5,
      billable_flag: "billable",
      evidence_source: "teams_deployment_chat",
      evidence_detail: "NSUH - 4/11/2026",
      requires_review: true,
      reason: "teams_presence_no_attendance",
    });
  });

  it("also covers task_evidence_no_attendance (no Teams context)", () => {
    const rows = buildSuggestedFill({
      exceptions: [ex("task_evidence_no_attendance", "Valentin Nikoliuk", "2026-04-12")],
      task_catalog: catalog,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].evidence_source).toBe("roster_attendance_only");
    expect(rows[0].site).toBe("");
  });

  it("falls back to fallbackHours when catalog has no std_hours_per_unit", () => {
    const looseCatalog: TaskCatalogEntry[] = [{
      ...catalog[0],
      std_hours_per_unit: null,
    }];
    const rows = buildSuggestedFill({
      exceptions: [ex("teams_presence_no_attendance", "Alejandro Perez", "2026-04-11")],
      task_catalog: looseCatalog,
      teams_presence: teamsRows,
      fallbackHours: 7.5,
    });
    expect(rows[0].std_hours_per_unit).toBeNull();
    expect(rows[0].suggested_hours).toBe(7.5);
  });

  it("deduplicates per (canonical_name, work_date)", () => {
    const rows = buildSuggestedFill({
      exceptions: [
        ex("teams_presence_no_attendance", "Alejandro Perez", "2026-04-11"),
        ex("teams_presence_no_task_evidence", "Alejandro Perez", "2026-04-11"),
      ],
      task_catalog: catalog,
      teams_presence: teamsRows,
    });
    expect(rows).toHaveLength(1);
  });

  it("ignores exception types that don't imply a fill suggestion", () => {
    const rows = buildSuggestedFill({
      exceptions: [
        ex("attendance_no_task_evidence", "Alejandro Perez", "2026-04-11"),
        ex("multiple_categories_same_day", "Alejandro Perez", "2026-04-11"),
        ex("split_unsupported", "Alejandro Perez", "2026-04-11"),
      ],
      task_catalog: catalog,
    });
    expect(rows).toHaveLength(0);
  });

  it("uses a user-provided defaultTaskCategory when supplied", () => {
    const rows = buildSuggestedFill({
      exceptions: [ex("teams_presence_no_attendance", "Alejandro Perez", "2026-04-11")],
      task_catalog: catalog,
      teams_presence: teamsRows,
      defaultTaskCategory: "Custom Bucket",
    });
    expect(rows[0].task_category).toBe("Custom Bucket");
    expect(rows[0].default_workstream).toBe("");
    expect(rows[0].suggested_hours).toBe(8);
  });
});

describe("suggestedFillToCsv", () => {
  it("writes a header row + escapes fields containing commas/quotes", () => {
    const rows = buildSuggestedFill({
      exceptions: [ex("teams_presence_no_attendance", "Alejandro Perez", "2026-04-11")],
      task_catalog: catalog,
      teams_presence: [{
        ...teamsRows[0],
        chat_topic: "NSUH, swing - 4/11/2026",
      }],
    });
    const csv = suggestedFillToCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("work_date,canonical_name");
    expect(lines[1]).toContain("\"NSUH, swing - 4/11/2026\"");
  });
});
