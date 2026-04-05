/** Phase C: optimistic concurrency + conflict payloads for task mutations. */

export const TASK_CONFLICT_CODE = "task_conflict" as const;

export type TaskConflictPayload = {
  code: typeof TASK_CONFLICT_CODE;
  message: string;
  serverTask: Record<string, unknown>;
};

export function isTaskConflictPayload(value: unknown): value is TaskConflictPayload {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return o.code === TASK_CONFLICT_CODE && typeof o.message === "string" && o.serverTask !== undefined;
}

/** Compare server updatedAt with client-supplied ISO string (1ms tolerance). */
export function taskUpdatedAtMatchesServer(
  serverUpdatedAt: Date | string | null | undefined,
  clientIso: string,
): boolean {
  if (serverUpdatedAt == null) return false;
  const a = new Date(serverUpdatedAt).getTime();
  const b = new Date(clientIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= 1;
}
