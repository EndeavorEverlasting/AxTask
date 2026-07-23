export function skillTierFromLevels(totalLevels: number): number {
  if (totalLevels >= 10) return 2;
  if (totalLevels >= 3) return 1;
  return 0;
}
