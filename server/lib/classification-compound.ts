const COMPOUND_RATE = 0.08;
const MAX_COMPOUND_PERIODS = 50;

/** Pure formula for contributor compound rewards (and unit tests). */
export function computeCompoundContributorBonus(baseCoinsAwarded: number, confirmationCount: number): number {
  const safeCount = Math.max(0, confirmationCount);
  const n = Math.min(safeCount + 1, MAX_COMPOUND_PERIODS);
  const compoundedValue = baseCoinsAwarded * Math.pow(1 + COMPOUND_RATE, n);
  const previousValue = baseCoinsAwarded * Math.pow(1 + COMPOUND_RATE, Math.max(n - 1, 0));
  const delta = compoundedValue - previousValue;
  return delta > 0 ? Math.max(1, Math.round(delta)) : 0;
}

export function getMaxCompoundPeriods(): number {
  return MAX_COMPOUND_PERIODS;
}
