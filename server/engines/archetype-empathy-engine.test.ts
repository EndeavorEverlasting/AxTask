// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  EMPTY_SIGNAL_COUNTS,
  computeEmpathyScore,
  countMarkovTransitions,
  toTransitionMatrix,
  type ArchetypeSignalCounts,
} from "./archetype-empathy-engine";

function counts(partial: Partial<ArchetypeSignalCounts>): ArchetypeSignalCounts {
  return { ...EMPTY_SIGNAL_COUNTS, ...partial };
}

describe("archetype-empathy-engine", () => {
  describe("computeEmpathyScore", () => {
    it("returns a score in [0,1] even with all-zero counts", () => {
      const { empathyScore } = computeEmpathyScore(EMPTY_SIGNAL_COUNTS);
      expect(empathyScore).toBeGreaterThanOrEqual(0);
      expect(empathyScore).toBeLessThanOrEqual(1);
    });

    it("clamps to [0,1] for extreme inputs", () => {
      const { empathyScore } = computeEmpathyScore(counts({
        shown: 100,
        opened: 100,
        submitted: 100,
        insightfulUp: 100,
        sentimentPositive: 100,
      }));
      expect(empathyScore).toBeGreaterThan(0.8);
      expect(empathyScore).toBeLessThanOrEqual(1);
    });

    it("increases monotonically when more explicit insights-up are added", () => {
      const base = computeEmpathyScore(counts({ shown: 10, opened: 2, submitted: 1 }));
      const better = computeEmpathyScore(counts({
        shown: 10,
        opened: 2,
        submitted: 1,
        insightfulUp: 5,
      }));
      expect(better.empathyScore).toBeGreaterThan(base.empathyScore);
    });

    it("decreases when explicit 'felt off' taps outnumber insightful ones", () => {
      const positive = computeEmpathyScore(counts({
        shown: 10,
        opened: 3,
        submitted: 2,
        insightfulUp: 3,
      }));
      const negative = computeEmpathyScore(counts({
        shown: 10,
        opened: 3,
        submitted: 2,
        insightfulDown: 3,
      }));
      expect(negative.empathyScore).toBeLessThan(positive.empathyScore);
    });

    it("surfaces sample count for k-anonymity guards", () => {
      const { samples } = computeEmpathyScore(counts({ shown: 4, submitted: 1, dismissed: 2 }));
      expect(samples).toBe(7);
    });

    it("subScores are each in [0,1]", () => {
      const { subScores } = computeEmpathyScore(counts({
        shown: 20,
        opened: 8,
        submitted: 4,
        insightfulUp: 3,
        insightfulDown: 2,
        sentimentPositive: 3,
        sentimentNegative: 1,
      }));
      for (const v of Object.values(subScores)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("markov transitions", () => {
    it("aggregates per-actor sequences into pair counts", () => {
      const seqs = new Map<string, string[]>([
        ["a", ["momentum", "strategy", "strategy"]],
        ["b", ["momentum", "strategy", "execution"]],
      ]);
      const counts = countMarkovTransitions(seqs);
      expect(counts.pairs["momentum->strategy"]).toBe(2);
      expect(counts.pairs["strategy->strategy"]).toBe(1);
      expect(counts.pairs["strategy->execution"]).toBe(1);
      expect(counts.fromTotals.momentum).toBe(2);
      expect(counts.fromTotals.strategy).toBe(2);
    });

    it("ignores sequences of length < 2", () => {
      const counts = countMarkovTransitions(new Map([["a", ["momentum"]]]));
      expect(Object.keys(counts.pairs)).toHaveLength(0);
    });

    it("row probabilities sum to approximately 1 per from-state", () => {
      const seqs = new Map<string, string[]>([
        ["a", ["momentum", "strategy"]],
        ["b", ["momentum", "execution"]],
        ["c", ["momentum", "strategy"]],
      ]);
      const matrix = toTransitionMatrix(countMarkovTransitions(seqs));
      const bucket: Record<string, number> = {};
      for (const r of matrix) bucket[r.from] = (bucket[r.from] ?? 0) + r.probability;
      for (const sum of Object.values(bucket)) {
        expect(sum).toBeGreaterThan(0.99);
        expect(sum).toBeLessThan(1.01);
      }
    });

    it("all probabilities are in [0,1]", () => {
      const seqs = new Map<string, string[]>([
        ["a", ["momentum", "strategy", "execution", "momentum"]],
      ]);
      const matrix = toTransitionMatrix(countMarkovTransitions(seqs));
      for (const r of matrix) {
        expect(r.probability).toBeGreaterThanOrEqual(0);
        expect(r.probability).toBeLessThanOrEqual(1);
      }
    });
  });
});
