// @vitest-environment node
import { describe, expect, it } from "vitest";
import { displayAveragePriorityScoreFromDb } from "./display-priority-score";

describe("displayAveragePriorityScoreFromDb", () => {
  it("divides raw DB average by 10 for UI parity", () => {
    expect(displayAveragePriorityScoreFromDb(500)).toBe(50);
    expect(displayAveragePriorityScoreFromDb(173.333)).toBeCloseTo(17.333, 2);
  });

  it("handles nullish as zero", () => {
    expect(displayAveragePriorityScoreFromDb(null)).toBe(0);
    expect(displayAveragePriorityScoreFromDb(undefined)).toBe(0);
  });
});
