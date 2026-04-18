/**
 * Archetype empathy engine.
 *
 * Pure functions that convert raw per-archetype signal counts into a scalar
 * empathy score in [0, 1], plus Markov transition probabilities. No DB, no
 * side effects — all persistence happens in the rollup worker.
 *
 * Signals (all counts per archetype, per bucket):
 *  - shown:          number of nudges displayed
 *  - opened:         "Open feedback" clicks
 *  - dismissed:      explicit "Not now" clicks or dialog closes
 *  - submitted:      feedback_submitted archetype-signals
 *  - insightfulUp:   explicit "Insightful" taps
 *  - insightfulDown: explicit "Felt off" taps
 *  - sentimentPositive / sentimentNeutral / sentimentNegative: per-submission
 *
 * Empathy is a weighted average of four sub-rates (each clamped to [0,1]):
 *   openRate          = opened / shown
 *   conversionRate    = submitted / max(opened, 1)
 *   explicitInsightRate = (insightfulUp - insightfulDown) / max(shown, 1)  // in [-1, 1] -> rescaled to [0, 1]
 *   sentimentRate     = (positive - negative) / max(submissions, 1)         // in [-1, 1] -> rescaled to [0, 1]
 *
 * Weights are documented in docs/ARCHETYPE_EMPATHY_ANALYTICS.md.
 */

export interface ArchetypeSignalCounts {
  shown: number;
  opened: number;
  dismissed: number;
  submitted: number;
  insightfulUp: number;
  insightfulDown: number;
  sentimentPositive: number;
  sentimentNeutral: number;
  sentimentNegative: number;
}

export const EMPTY_SIGNAL_COUNTS: ArchetypeSignalCounts = Object.freeze({
  shown: 0,
  opened: 0,
  dismissed: 0,
  submitted: 0,
  insightfulUp: 0,
  insightfulDown: 0,
  sentimentPositive: 0,
  sentimentNeutral: 0,
  sentimentNegative: 0,
});

export const EMPATHY_WEIGHTS = Object.freeze({
  openRate: 0.25,
  conversionRate: 0.25,
  explicitInsightRate: 0.30,
  sentimentRate: 0.20,
});

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function rescaleSigned(x: number): number {
  // Maps [-1, 1] -> [0, 1]
  return clamp01((x + 1) / 2);
}

export interface EmpathyScoreBreakdown {
  empathyScore: number;
  subScores: {
    openRate: number;
    conversionRate: number;
    explicitInsightRate: number;
    sentimentRate: number;
  };
  samples: number;
}

export function computeEmpathyScore(counts: ArchetypeSignalCounts): EmpathyScoreBreakdown {
  const shown = Math.max(0, counts.shown);
  const opened = Math.max(0, counts.opened);
  const submitted = Math.max(0, counts.submitted);
  const up = Math.max(0, counts.insightfulUp);
  const down = Math.max(0, counts.insightfulDown);
  const pos = Math.max(0, counts.sentimentPositive);
  const neg = Math.max(0, counts.sentimentNegative);
  const neu = Math.max(0, counts.sentimentNeutral);
  const submissions = pos + neg + neu;

  const openRate = clamp01(shown > 0 ? opened / shown : 0);
  const conversionRate = clamp01(opened > 0 ? submitted / opened : 0);
  const explicitInsightRate = rescaleSigned(shown > 0 ? (up - down) / shown : 0);
  const sentimentRate = rescaleSigned(submissions > 0 ? (pos - neg) / submissions : 0);

  const score = clamp01(
    openRate * EMPATHY_WEIGHTS.openRate
      + conversionRate * EMPATHY_WEIGHTS.conversionRate
      + explicitInsightRate * EMPATHY_WEIGHTS.explicitInsightRate
      + sentimentRate * EMPATHY_WEIGHTS.sentimentRate,
  );

  return {
    empathyScore: score,
    subScores: { openRate, conversionRate, explicitInsightRate, sentimentRate },
    samples: shown + submitted + counts.dismissed,
  };
}

export interface MarkovTransitionCounts {
  /** Map from `from->to` archetype string keys to count. */
  pairs: Record<string, number>;
  fromTotals: Record<string, number>;
}

/**
 * Aggregate an ordered sequence (per hashedActor) of archetype keys into a
 * first-order transition count matrix. Self-transitions are included.
 */
export function countMarkovTransitions(
  sequencesByActor: Map<string, string[]>,
): MarkovTransitionCounts {
  const pairs: Record<string, number> = {};
  const fromTotals: Record<string, number> = {};
  for (const seq of sequencesByActor.values()) {
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
