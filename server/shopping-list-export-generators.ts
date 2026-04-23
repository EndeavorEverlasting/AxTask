import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import type { Task } from "@shared/schema";
import { isShoppingTask } from "@shared/shopping-tasks";

export function filterShoppingTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => isShoppingTask(t));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildShoppingListHtmlDocument(tasks: Task[]): string {
  const items = tasks
    .map((t) => {
      const purchased = t.status === "completed" ? " checked" : "";
      const note = (t.notes ?? "").trim();
      const noteHtml = note ? ` <span class="note">(${escapeHtml(note)})</span>` : "";
      return `    <li><label><input type="checkbox"${purchased} /> <span class="activity">${escapeHtml(t.activity)}</span>${noteHtml}</label></li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>AxTask shopping list</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 40rem; }
    h1 { font-size: 1.25rem; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.5rem 0; }
    .note { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Shopping list</h1>
  <ul>
${items}
  </ul>
</body>
</html>`;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildShoppingListSpreadsheetBuffer(tasks: Task[], format: "csv" | "xlsx"): Buffer {
  const rows: string[][] = [["Purchased", "Activity", "Notes", "Date", "Status"]];
  for (const t of tasks) {
    rows.push([
      t.status === "completed" ? "TRUE" : "FALSE",
      t.activity,
      (t.notes ?? "").replace(/\r?\n/g, " "),
      t.date,
      t.status,
    ]);
  }

  if (format === "csv") {
    const text = rows.map((r) => r.map((c) => escapeCsvCell(c)).join(",")).join("\r\n");
    return Buffer.from(text, "utf8");
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Shopping");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

export function generateShoppingListPdf(tasks: Task[]): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: { Title: "AxTask shopping list" },
  });

  doc.fontSize(18).fillColor("#1e40af").text("AxTask — Shopping list", { align: "center" });
  doc.moveDown(1);
  doc.fontSize(11).fillColor("#111827");

  for (const t of tasks) {
    const checked = t.status === "completed" ? "\u2611 " : "\u2610 ";
    doc.text(checked + t.activity, { width: 500 });
    if ((t.notes ?? "").trim()) {
      doc.fontSize(9).fillColor("#6b7280").text("  " + (t.notes ?? "").trim().replace(/\r?\n/g, " "), { width: 480 });
      doc.fontSize(11).fillColor("#111827");
    }
    doc.moveDown(0.35);
  }

  return doc;
}

/** Neutral row for collaborative shared lists (not `Task`). */
export type SharedShoppingExportRow = {
  label: string;
  notes: string;
  purchased: boolean;
};

export function buildSharedShoppingListHtmlDocument(rows: SharedShoppingExportRow[], listTitle: string): string {
  const items = rows
    .map((r) => {
      const purchased = r.purchased ? " checked" : "";
      const note = (r.notes ?? "").trim();
      const noteHtml = note ? ` <span class="note">(${escapeHtml(note)})</span>` : "";
      const cls = r.purchased ? "purchased" : "";
      return `    <li${cls ? ` class="${cls}"` : ""}><label><input type="checkbox" disabled${purchased} /> <span class="activity">${escapeHtml(r.label)}</span>${noteHtml}</label></li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(listTitle)} — AxTask</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 40rem; }
    h1 { font-size: 1.25rem; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.5rem 0; padding: 0.35rem 0.5rem; border-radius: 0.375rem; }
    li.purchased { background: #ecfdf5; color: #047857; }
    li.purchased .activity { text-decoration: line-through; }
    .note { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>${escapeHtml(listTitle)}</h1>
  <ul>
${items}
  </ul>
</body>
</html>`;
}

export function buildSharedShoppingListSpreadsheetBuffer(
  rows: SharedShoppingExportRow[],
  format: "csv" | "xlsx",
  listTitle: string,
): Buffer {
  const rowsAll: string[][] = [
    ["List", listTitle, ""],
    ["Purchased", "Label", "Notes"],
    ...rows.map((r) => [
      r.purchased ? "TRUE" : "FALSE",
      r.label,
      (r.notes ?? "").replace(/\r?\n/g, " "),
    ]),
  ];

  if (format === "csv") {
    const text = rowsAll.map((r) => r.map((c) => escapeCsvCell(c)).join(",")).join("\r\n");
    return Buffer.from(text, "utf8");
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rowsAll);
  XLSX.utils.book_append_sheet(wb, ws, "Shopping");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

export function generateSharedShoppingListPdf(
  rows: SharedShoppingExportRow[],
  listTitle: string,
): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: { Title: listTitle },
  });

  doc.fontSize(18).fillColor("#047857").text(listTitle, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#6b7280").text("AxTask — shared shopping list", { align: "center" });
  doc.moveDown(1);
  doc.fontSize(11).fillColor("#111827");

  for (const r of rows) {
    const checked = r.purchased ? "\u2611 " : "\u2610 ";
    if (r.purchased) {
      doc.fillColor("#047857");
    } else {
      doc.fillColor("#111827");
    }
    doc.text(checked + r.label, { width: 500 });
    doc.fillColor("#111827");
    if ((r.notes ?? "").trim()) {
      doc.fontSize(9).fillColor("#6b7280").text("  " + (r.notes ?? "").trim().replace(/\r?\n/g, " "), { width: 480 });
      doc.fontSize(11).fillColor("#111827");
    }
    doc.moveDown(0.35);
  }

  return doc;
}

