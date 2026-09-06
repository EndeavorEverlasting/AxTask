export interface TaskImportIdentityInput {
  date?: string | null;
  time?: string | null;
  activity?: string | null;
  notes?: string | null;
}

export interface TaskImportPresenceVerification {
  expectedLogicalTasks: number;
  presentLogicalTasks: number;
  missingLogicalTasks: number;
  missing: TaskImportIdentityInput[];
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
 * Compare expected import rows with currently owned tasks using the canonical
 * logical identity. Repeated source rows count once because AxTask stores one
 * logical task and reports repeats as duplicates.
 */
export function verifyTaskImportPresence(
  expectedTasks: TaskImportIdentityInput[],
  currentTasks: TaskImportIdentityInput[],
): TaskImportPresenceVerification {
  const expectedByKey = new Map<string, TaskImportIdentityInput>();
  for (const task of expectedTasks) {
    expectedByKey.set(buildTaskImportIdentityKey(task), task);
  }

  const currentKeys = new Set(currentTasks.map(buildTaskImportIdentityKey));
  const missing = [...expectedByKey.entries()]
    .filter(([key]) => !currentKeys.has(key))
    .map(([, task]) => task);

  return {
    expectedLogicalTasks: expectedByKey.size,
    presentLogicalTasks: expectedByKey.size - missing.length,
    missingLogicalTasks: missing.length,
    missing,
  };
}

/**
 * Persisted import fingerprints historically hash a pipe-joined base. Keep that
 * exact representation for backward compatibility with existing fingerprint
 * rows; do not use it as a new unhashed comparison key.
 */
export function buildLegacyTaskImportFingerprintBase(task: TaskImportIdentityInput): string {
  return getTaskImportIdentityParts(task).join("|");
}
