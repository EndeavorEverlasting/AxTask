import {
  buildTaskImportIdentityKey,
  type TaskImportIdentityInput,
} from "@shared/task-import-identity";

export interface TaskImportPresenceVerification {
  expectedLogicalTasks: number;
  presentLogicalTasks: number;
  missingLogicalTasks: number;
  missing: TaskImportIdentityInput[];
}

/**
 * Prove selected spreadsheet tasks are present after import using the same
 * normalized logical identity dimensions as AxTask import dedupe. Repeated
 * source rows count once because AxTask intentionally stores one logical task.
 */
export function verifyImportedTaskPresence(
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
