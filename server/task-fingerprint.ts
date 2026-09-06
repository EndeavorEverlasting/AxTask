import { createHash } from "crypto";
import {
  buildLegacyTaskImportFingerprintBase,
  normalizeTaskImportIdentityValue,
} from "@shared/task-import-identity";

export const normalizeForFingerprint = normalizeTaskImportIdentityValue;

/** Stable legacy hash for persisted dedupe / import anti-abuse records. */
export function computeTaskFingerprint(task: {
  date?: string;
  time?: string | null;
  activity?: string | null;
  notes?: string | null;
}): string {
  return createHash("sha256").update(buildLegacyTaskImportFingerprintBase(task)).digest("hex");
}
