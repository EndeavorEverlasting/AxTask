export interface TaskImportIdentityInput {
  date?: string | null;
  time?: string | null;
  activity?: string | null;
  notes?: string | null;
}

export function normalizeTaskImportIdentityValue(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function getTaskImportIdentityParts(task: TaskImportIdentityInput): [string, string, string, string] {
  return [
    normalizeTaskImportIdentityValue(task.date),
    normalizeTaskImportIdentityValue(task.time),
    normalizeTaskImportIdentityValue(task.activity),
    normalizeTaskImportIdentityValue(task.notes),
  ];
}

/** Collision-safe logical identity for new operator/client comparisons. */
export function buildTaskImportIdentityKey(task: TaskImportIdentityInput): string {
  return JSON.stringify(getTaskImportIdentityParts(task));
}

/**
 * Persisted import fingerprints historically hash a pipe-joined base. Keep that
 * exact representation for backward compatibility with existing fingerprint
 * rows; do not use it as a new unhashed comparison key.
 */
export function buildLegacyTaskImportFingerprintBase(task: TaskImportIdentityInput): string {
  return getTaskImportIdentityParts(task).join("|");
}
