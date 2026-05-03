import { createHash } from "crypto";

export function normalizeForFingerprint(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable hash for dedupe / import anti-abuse (matches server/routes bulk import). */
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
  ].join("|");
  return createHash("sha256").update(base).digest("hex");
}
