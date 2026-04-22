import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import type { Task } from "@shared/schema";

const HEADERS = [
  "Date",
  "Time",
  "Activity",
  "Status",
  "Priority",
  "Classification",
  "Notes",
] as const;

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildTasksSpreadsheetBuffer(tasks: Task[], format: "csv" | "xlsx"): Buffer {
  const rows: string[][] = [Array.from(HEADERS)];
  for (const t of tasks) {
    rows.push([
      t.date,
      t.time ?? "",
      t.activity,
      t.status,
      t.priority,
      t.classification,
      (t.notes ?? "").replace(/\r?\n/g, " "),
    ]);
  }

  if (format === "csv") {
    const text = rows.map((r) => r.map((c) => escapeCsvCell(c)).join(",")).join("\r\n");
    return Buffer.from(text, "utf8");
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

export function generateTaskReportPdf(task: Task, userName: string): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `AxTask Task Report — ${task.activity.slice(0, 80)}`,
    },
  });

  doc.fontSize(18).fillColor("#1e40af").text("AxTask — Task report", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#6b7280").text(`Generated for ${userName}`, { align: "center" });
  doc.moveDown(1.2);

  doc.fontSize(12).fillColor("#111827").text("Activity", { continued: false });
  doc.fontSize(11).fillColor("#374151").text(task.activity, { width: 500 });
  doc.moveDown(0.8);

  const meta: [string, string][] = [
    ["Date", task.date],
    ["Time", task.time ?? "—"],
    ["Status", task.status],
    ["Priority", task.priority],
    ["Classification", task.classification],
  ];
  for (const [k, v] of meta) {
    doc.fontSize(10).fillColor("#6b7280").text(`${k}: `, { continued: true });
    doc.fillColor("#111827").text(v);
  }

  doc.moveDown(0.8);
  doc.fontSize(12).fillColor("#111827").text("Notes");
  doc.fontSize(10).fillColor("#374151").text((task.notes ?? "—").trim() || "—", { width: 500 });

  return doc;
}

export function buildTaskReportXlsxBuffer(task: Task): Buffer {
  const wb = XLSX.utils.book_new();
  const rows: string[][] = [
    ["Field", "Value"],
    ["Activity", task.activity],
    ["Date", task.date],
    ["Time", task.time ?? ""],
    ["Status", task.status],
    ["Priority", task.priority],
    ["Classification", task.classification],
    ["Notes", (task.notes ?? "").replace(/\r?\n/g, "\n")],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Task");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

export function buildTaskReportMarkdown(task: Task, userName: string): string {
  const lines = [
    `# AxTask — task export`,
    ``,
    `_Generated for ${userName}_`,
    ``,
    `## ${task.activity.replace(/\r?\n/g, " ")}`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| Date | ${task.date} |`,
    `| Time | ${task.time ?? "—"} |`,
    `| Status | ${task.status} |`,
    `| Priority | ${task.priority} |`,
    `| Classification | ${task.classification} |`,
    ``,
    `### Notes`,
    ``,
    (task.notes ?? "—").trim() || "—",
    ``,
  ];
  return lines.join("\n");
}
