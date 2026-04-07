/**
 * Single source of truth for task spreadsheet rows (CSV / XLSX export).
 * Keep aligned with import parsing in `client/src/lib/csv-utils.ts`.
 */
import Papa from "papaparse";
import type { Task } from "./schema";
import { formatAxTaskCsvAttribution } from "./attribution";

export const TASK_SPREADSHEET_HEADERS = [
  "Date",
  "Priority",
  "Result",
  "Activity",
  "Notes",
  "Urgency",
  "Impact",
  "Effort",
  "Pre-Reqs",
  "Sub-Priority",
  "Time Start",
  "Time End",
  "Subtypes",
] as const;

function starRating(n: number | null | undefined): string {
  if (!n || n < 1) return "☆☆☆☆☆";
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export function taskToSpreadsheetRow(task: Task): string[] {
  return [
    task.date || "",
    task.priority || "",
    task.status === "completed" ? "TRUE" : "FALSE",
    task.activity || "",
    task.notes || "",
    starRating(task.urgency ?? null),
    starRating(task.impact ?? null),
    starRating(task.effort ?? null),
    task.prerequisites || "",
    "",
    "",
    "",
    "",
  ];
}

export function tasksToSpreadsheetRows(tasks: Task[]): string[][] {
  return tasks.map(taskToSpreadsheetRow);
}

/** Full CSV document including attribution line (matches prior client export). */
export function buildTasksCsvExport(tasks: Task[]): string {
  const headers = [...TASK_SPREADSHEET_HEADERS];
  const rows = tasksToSpreadsheetRows(tasks);
  const body = Papa.unparse({ fields: headers, data: rows });
  return `${formatAxTaskCsvAttribution()}\n${body}`;
}
