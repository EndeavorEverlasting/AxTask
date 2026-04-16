/** DB stores integer priority score as engine score × 10; UI shows engine units. */
export function displayAveragePriorityScoreFromDb(rawAvg: number | null | undefined): number {
  const raw = Number(rawAvg) || 0;
  return Math.round((raw / 10) * 1000) / 1000;
}
