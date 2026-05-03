/**
 * Shared byte-formatting helpers for the Admin > Storage cards. Mirrors
 * server/services/db-size.ts `humanBytes`, but is kept separate so the
 * bundle split doesn't reach into server code.
 */
export function humanBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  if (i === 0) return `${Math.round(v)} ${units[i]}`;
  const precision = v < 10 ? 2 : v < 100 ? 1 : 0;
  return `${v.toFixed(precision)} ${units[i]}`;
}

export function percentOf(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 1000) / 10));
}
