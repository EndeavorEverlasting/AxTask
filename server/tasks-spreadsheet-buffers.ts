import * as XLSX from "xlsx";
import type { Task } from "@shared/schema";
import { TASK_SPREADSHEET_HEADERS, buildTasksCsvExport, tasksToSpreadsheetRows } from "@shared/task-spreadsheet-export";

export function tasksToCsvBuffer(tasks: Task[]): Buffer {
  return Buffer.from(buildTasksCsvExport(tasks), "utf8");
}

export function tasksToXlsxBuffer(tasks: Task[]): Buffer {
  const headerRow = [...TASK_SPREADSHEET_HEADERS];
  const dataRows = tasksToSpreadsheetRows(tasks);
  const aoa = [headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}
