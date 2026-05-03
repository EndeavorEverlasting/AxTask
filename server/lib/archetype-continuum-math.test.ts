import { describe, expect, it } from "vitest";
import {
  ARCHETYPE_CONTINUUM_SUM_MILLI,
  distributeToFixedSum,
  emaTowardArchetype,
} from "./archetype-continuum-math";

describe("distributeToFixedSum", () => {
  it("restores exact target sum with largest-remainder", () => {
    const raw = [20000.7, 20000.6, 20000.5, 20000.4, 19997.8];
    const out = distributeToFixedSum(raw, ARCHETYPE_CONTINUUM_SUM_MILLI);
    expect(out.reduce((a, b) => a + b, 0)).toBe(ARCHETYPE_CONTINUUM_SUM_MILLI);
    expect(out.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
  });
});

describe("emaTowardArchetype", () => {
  it("nudges mass toward one archetype while preserving sum", () => {
    const uniform = [20000, 20000, 20000, 20000, 20000];
    const next = emaTowardArchetype(uniform, 4, 0.1, ARCHETYPE_CONTINUUM_SUM_MILLI);
    expect(next.reduce((a, b) => a + b, 0)).toBe(ARCHETYPE_CONTINUUM_SUM_MILLI);
    expect(next[4]).toBeGreaterThan(20000);
    expect(next[0]).toBeLessThan(20000);
  });
});
