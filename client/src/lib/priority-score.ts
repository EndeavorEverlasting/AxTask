export function normalizeStoredPriorityScore(score: number | null | undefined): number {
  const raw = Number(score ?? 0);
  return Number.isFinite(raw) ? raw / 10 : 0;
}

export function formatStoredPriorityScore(
  score: number | null | undefined,
  decimals = 3,
): string {
  return normalizeStoredPriorityScore(score).toFixed(decimals);
}
