export interface TaskImportIdentityInput {
  date?: string | null;
  time?: string | null;
  activity?: string | null;
  notes?: string | null;
}

export function normalizeTaskImportIdentityValue(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Canonical logical task identity used by spreadsheet/account import dedupe and
 * client-side post-import verification. This is intentionally unhashed so it
 * remains browser-safe; the server hashes the returned key before persistence.
 */
export function buildTaskImportIdentityKey(task: TaskImportIdentityInput): string {
  return [
    normalizeTaskImportIdentityValue(task.date),
    normalizeTaskImportIdentityValue(task.time),
    normalizeTaskImportIdentityValue(task.activity),
    normalizeTaskImportIdentityValue(task.notes),
  ].join("|");
}
