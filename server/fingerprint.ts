import { createHash } from "crypto";

export function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .sort()
    .join(" ");
}

export function computeContentHash(activity: string, date: string): string {
  const normalized = normalizeForHash(activity) + "|" + date.trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export function computeFileHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
