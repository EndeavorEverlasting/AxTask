// @vitest-environment node
import { describe, expect, it } from "vitest";
import { countMarkovTransitions, toTransitionMatrix } from "./first-order";

describe("first-order Markov", () => {
  it("aggregates per-key sequences into pair counts", () => {
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
