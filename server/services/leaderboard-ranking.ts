export type LeaderboardMetricRow = {
  userId: string;
  metricValue: number;
};

export function normalizeLeaderboardRows(rows: LeaderboardMetricRow[]): LeaderboardMetricRow[] {
  return rows
    .map((row) => ({
      userId: row.userId,
      metricValue: Number(row.metricValue ?? 0),
    }))
    .filter((row) => Boolean(row.userId))
    .sort((a, b) => b.metricValue - a.metricValue || a.userId.localeCompare(b.userId));
}

export function combineLeaderboardRows(...groups: LeaderboardMetricRow[][]): LeaderboardMetricRow[] {
  const totals = new Map<string, number>();
  for (const group of groups) {
    for (const row of group) {
      if (!row.userId) continue;
      totals.set(row.userId, (totals.get(row.userId) ?? 0) + Number(row.metricValue ?? 0));
    }
  }
  return normalizeLeaderboardRows(
    [...totals.entries()].map(([userId, metricValue]) => ({ userId, metricValue })),
  );
}

export function skillTierFromLevels(totalLevels: number): number {
  if (totalLevels >= 10) return 2;
  if (totalLevels >= 3) return 1;
  return 0;
}
