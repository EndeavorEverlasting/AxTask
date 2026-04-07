import * as XLSX from "xlsx";
import type { Task } from "@shared/schema";
import { AXTASK_BRAND, AXTASK_TAGLINE } from "@shared/attribution";

function formatWhen(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    const x = typeof d === "string" ? new Date(d) : d;
    return x.toISOString();
  } catch {
    return String(d);
  }
}

export function generateTaskReportXlsxBuffer(task: Task): Buffer {
  const rows: string[][] = [
    ["Field", "Value"],
    ["Task ID", task.id],
    ["Date", task.date],
    ["Time", task.time || ""],
    ["Activity", task.activity],
    ["Status", task.status],
    ["Priority", task.priority],
    ["Classification", task.classification],
    ["Notes", task.notes || ""],
    ["Urgency", task.urgency != null ? String(task.urgency) : ""],
    ["Impact", task.impact != null ? String(task.impact) : ""],
    ["Effort", task.effort != null ? String(task.effort) : ""],
    ["Prerequisites", task.prerequisites || ""],
    ["Recurrence", task.recurrence || ""],
    ["Visibility", task.visibility],
    ["Created", formatWhen(task.createdAt)],
    ["Updated", formatWhen(task.updatedAt)],
    [],
    ["", `${AXTASK_BRAND} · ${AXTASK_TAGLINE}`],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}
