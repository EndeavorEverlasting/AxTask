function parseNonNegativeInt(name: string, defaultVal: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultVal;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultVal;
}

/** When set to `1` and NODE_ENV is `development`, productivity exports skip coin debits. */
export function productivityExportsFreeInDev(): boolean {
  return process.env.AXTASK_FREE_PRODUCTIVITY_EXPORTS === "1" && process.env.NODE_ENV === "development";
}

export function getChecklistPdfExportCost(): number {
  return parseNonNegativeInt("AXTASK_EXPORT_CHECKLIST_PDF_COINS", 15);
}

export function getTasksSpreadsheetExportCost(): number {
  return parseNonNegativeInt("AXTASK_EXPORT_TASKS_SPREADSHEET_COINS", 20);
}

export function getTaskReportPdfCost(): number {
  return parseNonNegativeInt("AXTASK_EXPORT_TASK_REPORT_PDF_COINS", 25);
}

export function getTaskReportXlsxCost(): number {
  return parseNonNegativeInt("AXTASK_EXPORT_TASK_REPORT_XLSX_COINS", 25);
}
