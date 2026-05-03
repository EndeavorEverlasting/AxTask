/**
 * Build .xlsx buffer for technician hours report (plain AOAs for Excel / Excel Online).
 */
import * as XLSX from "xlsx";
import type { TechnicianHoursParams, TechnicianHoursReport, UnifiedDetailRow } from "./technician-hours-report";

const DETAIL_HEADER: (keyof UnifiedDetailRow | string)[] = [
  "work_date",
  "canonical_name",
  "project",
  "hours",
  "clock_in",
  "clock_out",
  "source",
  "source_sheet",
  "source_row",
  "source_ref",
  "extra",
];

function detailRowsToAoa(rows: UnifiedDetailRow[]): unknown[][] {
  const header = [...DETAIL_HEADER];
  const body = rows.map((r) => [
    r.work_date,
    r.canonical_name,
    r.project,
    r.hours ?? "",
    r.clock_in,
    r.clock_out,
    r.source,
    r.source_sheet,
    r.source_row,
    r.source_ref,
    r.extra,
  ]);
  return [header, ...body];
}

function metaSheet(
  report: TechnicianHoursReport,
  fileNames?: TechnicianHoursParams["fileNames"],
): unknown[][] {
  const { meta } = report;
  const rows: unknown[][] = [
    ["Technician hours report"],
    [],
    ["Generated (UTC)", meta.generatedAtIso],
    ["Resolved technician", meta.resolvedTechnician ?? ""],
    ["Project filter", meta.projectFilter || "(none)"],
    ["Month (detail)", meta.month],
    ["Focus period", `${meta.focusStart} through ${meta.focusEnd}`],
    ["Detail sheets", meta.detailSheetsIncluded ? "yes" : "no"],
    [],
    ["Source uploads (filenames only)"],
    ["Task Tracker", fileNames?.taskTracker ?? ""],
    ["Roster / Billing", fileNames?.roster ?? ""],
    ["Manager workbook", fileNames?.manager ?? ""],
    [],
    ["Notes"],
    ...meta.notes.map((n) => [n]),
    [],
    [
      "Figures reflect the uploaded workbooks only; this file is a structured extract for review.",
    ],
  ];
  return rows;
}

function byProjectSheet(report: TechnicianHoursReport): unknown[][] {
  if (report.byProjectSingle.length > 0) {
    return [
      ["By project (single technician)"],
      [],
      ["Project", "Hours (month window)", "Hours (focus window)"],
      ...report.byProjectSingle.map((r) => [r.project, r.aprilHours, r.focusHours]),
    ];
  }
  if (report.byProjectRoster.length > 0) {
    return [
      ["By project (roster matches)"],
      [],
      ["Person", "Project", "Hours (month window)", "Hours (focus window)"],
      ...report.byProjectRoster.map((r) => [
        r.canonical_name,
        r.project,
        r.aprilHours,
        r.focusHours,
      ]),
    ];
  }
  return [
    ["By project"],
    [],
    ["No rows — resolve a technician or set a project filter with matching roster rows."],
  ];
}

export function buildTechnicianHoursXlsxBuffer(
  report: TechnicianHoursReport,
  fileNames?: TechnicianHoursParams["fileNames"],
): Buffer {
  const wb = XLSX.utils.book_new();

  const meta = XLSX.utils.aoa_to_sheet(metaSheet(report, fileNames));
  XLSX.utils.book_append_sheet(wb, meta, "ReportMeta");

  const bp = XLSX.utils.aoa_to_sheet(byProjectSheet(report));
  XLSX.utils.book_append_sheet(wb, bp, "ByProject");

  if (report.meta.detailSheetsIncluded) {
    const apr = XLSX.utils.aoa_to_sheet(detailRowsToAoa(report.aprilDetail));
    XLSX.utils.book_append_sheet(wb, apr, "AprilDetail");

    const foc = XLSX.utils.aoa_to_sheet(detailRowsToAoa(report.focusDetail));
    XLSX.utils.book_append_sheet(wb, foc, "FocusDetail");
  } else {
    const skip = XLSX.utils.aoa_to_sheet([
      ["AprilDetail / FocusDetail"],
      [],
      [
        "Detail sheets omitted — use a single technician (or a project filter that matches exactly one roster row).",
      ],
    ]);
    XLSX.utils.book_append_sheet(wb, skip, "DetailSkipped");
  }

  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}
