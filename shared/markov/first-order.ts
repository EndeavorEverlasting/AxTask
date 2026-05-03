/**
 * First-order discrete Markov transition counting and row normalization.
 * Used by archetype rollup (aggregate sequences) and client-side task prediction.
 */

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export interface MarkovTransitionCounts {
  /** Map from `from->to` string keys to count. */
  pairs: Record<string, number>;
  fromTotals: Record<string, number>;
}

/**
 * Aggregate ordered sequences (one string state per step) into first-order
 * transition counts. Self-transitions are included.
 */
export function countMarkovTransitions(sequencesByKey: Map<string, string[]>): MarkovTransitionCounts {
  const pairs: Record<string, number> = {};
  const fromTotals: Record<string, number> = {};
  for (const seq of sequencesByKey.values()) {
    for (let i = 1; i < seq.length; i++) {
      const from = seq[i - 1];
      const to = seq[i];
      if (!from || !to) continue;
      const k = `${from}->${to}`;
      pairs[k] = (pairs[k] ?? 0) + 1;
      fromTotals[from] = (fromTotals[from] ?? 0) + 1;
    }
  }
  return { pairs, fromTotals };
}

export interface MarkovProbabilityRow {
  from: string;
  to: string;
  probability: number;
  count: number;
}

/** Row-normalize transition counts into probabilities in [0,1]. */
export function toTransitionMatrix(counts: MarkovTransitionCounts): MarkovProbabilityRow[] {
  const rows: MarkovProbabilityRow[] = [];
  for (const [key, count] of Object.entries(counts.pairs)) {
    const [from, to] = key.split("->");
    const total = counts.fromTotals[from] ?? 0;
    const probability = total > 0 ? count / total : 0;
    rows.push({ from, to, probability: clamp01(probability), count });
  }
  return rows;
}
