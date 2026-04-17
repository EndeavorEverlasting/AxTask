import { describe, expect, it } from "vitest";
import {
  buildTechnicianHoursReport,
  buildUnifiedDetailRows,
  dateInMonth,
  dateInRangeInclusive,
  personMatchesProjectFilter,
  resolveTechnicianName,
  validateHoursReportParams,
} from "./technician-hours-report";
import { buildTechnicianHoursXlsxBuffer } from "./technician-hours-xlsx";
import type { AttendanceRow, BillingDetailExisting, ManagerExistingRow, Person } from "./types";

const samplePeople: Person[] = [
  {
    canonical_name: "Valentin Nikoliuk",
    home_base: "",
    consumed_availability: "",
    availability: "",
    default_project: "Neuron Alpha",
    secondary_project: "",
    tertiary_project: "",
    quaternary_project: "",
    uid_northwell: "",
    uid_agilant: "",
    notes: "",
    active: true,
    source_sheet: "Roster",
    source_row: 3,
  },
  {
    canonical_name: "Other Person",
    home_base: "",
    consumed_availability: "",
    availability: "",
    default_project: "Neuron Beta",
    secondary_project: "",
    tertiary_project: "",
    quaternary_project: "",
    uid_northwell: "",
    uid_agilant: "",
    notes: "",
    active: true,
    source_sheet: "Roster",
    source_row: 4,
  },
];

describe("validateHoursReportParams", () => {
  it("accepts valid params", () => {
    expect(
      validateHoursReportParams({
        month: "2026-04",
        focusStart: "2026-04-10",
        focusEnd: "2026-04-16",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects bad month", () => {
    const r = validateHoursReportParams({
      month: "202604",
      focusStart: "2026-04-10",
      focusEnd: "2026-04-16",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects inverted range", () => {
    const r = validateHoursReportParams({
      month: "2026-04",
      focusStart: "2026-04-20",
      focusEnd: "2026-04-10",
    });
    expect(r.ok).toBe(false);
  });
});

describe("date filters", () => {
  it("dateInMonth", () => {
    expect(dateInMonth("2026-04-01", "2026-04")).toBe(true);
    expect(dateInMonth("2026-03-31", "2026-04")).toBe(false);
  });

  it("dateInRangeInclusive", () => {
    expect(dateInRangeInclusive("2026-04-15", "2026-04-10", "2026-04-20")).toBe(true);
    expect(dateInRangeInclusive("2026-04-09", "2026-04-10", "2026-04-20")).toBe(false);
  });
});

describe("resolveTechnicianName", () => {
  it("resolves exact and substring", () => {
    expect(resolveTechnicianName("Valentin Nikoliuk", samplePeople)).toBe("Valentin Nikoliuk");
    expect(resolveTechnicianName("valentin", samplePeople)).toBe("Valentin Nikoliuk");
  });
});

describe("personMatchesProjectFilter", () => {
  it("matches substring on default project", () => {
    expect(personMatchesProjectFilter(samplePeople[0], "neuron")).toBe(true);
    expect(personMatchesProjectFilter(samplePeople[0], "Other")).toBe(false);
  });
});

describe("buildUnifiedDetailRows", () => {
  const attendance: AttendanceRow[] = [
    {
      canonical_name: "Valentin Nikoliuk",
      default_project: "Neuron Alpha",
      work_date: "2026-04-02",
      clock_in: "8:00 AM",
      clock_out: "5:00 PM",
      attendance_code: "PRESENT",
      attendance_hours: 8,
      source_sheet: "Live - Apr 2026",
      source_row: 5,
      source_ref: "C5:D5",
    },
  ];
  const billing: BillingDetailExisting[] = [
    {
      canonical_name: "Valentin Nikoliuk",
      work_date: "2026-04-02",
      worked_project: "Neuron Alpha",
      billing_bucket: "x",
      clock_in: "",
      clock_out: "",
      hours: 8,
      billable_flag: "",
      source_ref: "ref",
      notes: "",
      source_sheet: "Billing Detail - Apr 2026",
      source_row: 10,
    },
  ];
  const manager: ManagerExistingRow[] = [];

  it("emits separate lines per source", () => {
    const rows = buildUnifiedDetailRows("Valentin Nikoliuk", attendance, billing, manager);
    expect(rows.length).toBe(2);
    expect(rows[0].source).toBe("Live attendance");
    expect(rows[1].source).toBe("Billing Detail");
  });
});

describe("buildTechnicianHoursReport", () => {
  const attendance: AttendanceRow[] = [
    {
      canonical_name: "Valentin Nikoliuk",
      default_project: "Neuron Alpha",
      work_date: "2026-04-02",
      clock_in: "8:00 AM",
      clock_out: "5:00 PM",
      attendance_code: "PRESENT",
      attendance_hours: 8,
      source_sheet: "Live",
      source_row: 5,
      source_ref: "A1",
    },
    {
      canonical_name: "Valentin Nikoliuk",
      default_project: "Neuron Alpha",
      work_date: "2026-04-10",
      clock_in: "8:00 AM",
      clock_out: "12:00 PM",
      attendance_code: "PRESENT",
      attendance_hours: 4,
      source_sheet: "Live",
      source_row: 6,
      source_ref: "A2",
    },
  ];

  it("aggregates by project for month and focus", () => {
    const r = buildTechnicianHoursReport({
      attendance,
      billing_detail_existing: [],
      manager_existing_rows: [],
      people: samplePeople,
      technicianQuery: "Valentin Nikoliuk",
      projectFilter: "",
      month: "2026-04",
      focusStart: "2026-04-10",
      focusEnd: "2026-04-12",
    });
    expect(r.meta.detailSheetsIncluded).toBe(true);
    const neuron = r.byProjectSingle.find((x) => x.project === "Neuron Alpha");
    expect(neuron?.aprilHours).toBe(12);
    expect(neuron?.focusHours).toBe(4);
  });

  it("lists roster when multiple project matches and no technician", () => {
    const attendanceTwo: AttendanceRow[] = [
      ...attendance,
      {
        canonical_name: "Other Person",
        default_project: "Neuron Beta",
        work_date: "2026-04-03",
        clock_in: "9:00 AM",
        clock_out: "5:00 PM",
        attendance_code: "PRESENT",
        attendance_hours: 8,
        source_sheet: "Live",
        source_row: 7,
        source_ref: "A3",
      },
    ];
    const r = buildTechnicianHoursReport({
      attendance: attendanceTwo,
      billing_detail_existing: [],
      manager_existing_rows: [],
      people: samplePeople,
      technicianQuery: "",
      projectFilter: "Neuron",
      month: "2026-04",
      focusStart: "2026-04-01",
      focusEnd: "2026-04-30",
    });
    expect(r.meta.detailSheetsIncluded).toBe(false);
    expect(r.byProjectRoster.some((x) => x.canonical_name === "Valentin Nikoliuk")).toBe(true);
    expect(r.byProjectRoster.some((x) => x.canonical_name === "Other Person")).toBe(true);
  });
});

describe("buildTechnicianHoursXlsxBuffer", () => {
  it("returns a non-empty buffer", () => {
    const report = buildTechnicianHoursReport({
      attendance: [],
      billing_detail_existing: [],
      manager_existing_rows: [],
      people: samplePeople,
      technicianQuery: "Valentin Nikoliuk",
      projectFilter: "",
      month: "2026-04",
      focusStart: "2026-04-01",
      focusEnd: "2026-04-30",
    });
    const buf = buildTechnicianHoursXlsxBuffer(report);
    expect(buf.length).toBeGreaterThan(200);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
