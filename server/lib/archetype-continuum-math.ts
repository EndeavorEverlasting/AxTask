/** Integer weights on five archetypes summing to SUM_MILLI (= 1.0). */
export const ARCHETYPE_CONTINUUM_SUM_MILLI = 100_000;

/** Round fractional EMA result to integers that sum exactly to targetSum. */
export function distributeToFixedSum(raw: number[], targetSum: number): number[] {
  const floored = raw.map((x) => Math.floor(x));
  let sum = floored.reduce((a, b) => a + b, 0);
  let remainder = targetSum - sum;
  if (remainder < 0) {
    const asc = floored.map((x, i) => ({ i, x })).sort((a, b) => a.x - b.x);
    let k = 0;
    while (remainder < 0 && k < asc.length * 10) {
      const cell = asc[k % asc.length]!;
      if (floored[cell.i]! > 0) {
        floored[cell.i] -= 1;
        remainder += 1;
      }
      k += 1;
    }
    return floored;
  }
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    floored[order[k % order.length]!.i] += 1;
  }
  return floored;
}

export function emaTowardArchetype(current: number[], archetypeIndex: number, alpha: number, sumMilli: number): number[] {
  const a = Math.min(1, Math.max(0, alpha));
  const target = new Array(5).fill(0);
  target[archetypeIndex] = sumMilli;
  const blended = current.map((c, j) => (1 - a) * c + a * target[j]!);
  return distributeToFixedSum(blended, sumMilli);
}
