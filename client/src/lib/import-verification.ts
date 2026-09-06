import {
  buildTaskImportIdentityKey,
  type TaskImportIdentityInput,
} from "@shared/task-import-identity";

export interface TaskImportVerificationResult {
  expectedLogicalTasks: number;
  presentLogicalTasks: number;
  missingLogicalTasks: number;
  missing: TaskImportIdentityInput[];
}

/**
 * Verify logical task presence after import using the same identity contract as
 * server dedupe. Duplicate rows in the source count once because AxTask stores
 * one logical task and reports repeats as skipped duplicates.
 */
export function verifyImportedTaskPresence(
  expectedTasks: TaskImportIdentityInput[],
  currentTasks: TaskImportIdentityInput[],
): TaskImportVerificationResult {
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
