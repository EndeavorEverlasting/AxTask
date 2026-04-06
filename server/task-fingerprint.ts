/**
 * Pure fingerprint hash for task rows (no I/O). **Policy and dual-channel rules** live in
 * `import-task-dedupe.ts` — spreadsheet and JSON importers must both use that pipeline.
 */
import { createHash } from "crypto";

/** Field separator cannot appear in normalized fingerprint segments (normalize strips control chars). */
const FINGERPRINT_FIELD_SEP = "\x1f";

function normalizeForFingerprint(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\x1f/g, " ");
}

/** Same fingerprint as bulk CSV/Excel import — used to skip duplicate tasks across sources. */
export function computeTaskFingerprint(task: {
  date?: string;
  time?: string | null;
  activity?: string | null;
  notes?: string | null;
}): string {
  const base = [
    normalizeForFingerprint(task.date || ""),
    normalizeForFingerprint(task.time || ""),
    normalizeForFingerprint(task.activity || ""),
    normalizeForFingerprint(task.notes || ""),
  ].join(FINGERPRINT_FIELD_SEP);
  return createHash("sha256").update(base).digest("hex");
}
