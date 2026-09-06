import { createHash } from "crypto";
import {
  buildTaskImportIdentityKey,
  normalizeTaskImportIdentityValue,
} from "@shared/task-import-identity";

export const normalizeForFingerprint = normalizeTaskImportIdentityValue;

/** Stable hash for dedupe / import anti-abuse (matches server/routes bulk import). */
export function computeTaskFingerprint(task: {
  date?: string;
  time?: string | null;
  activity?: string | null;
  notes?: string | null;
}): string {
  return createHash("sha256").update(buildTaskImportIdentityKey(task)).digest("hex");
}
