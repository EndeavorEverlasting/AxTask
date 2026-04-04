import { describe, it, expect } from "vitest";
import { computeCompoundContributorBonus } from "./classification-compound";

describe("computeCompoundContributorBonus", () => {
  it("awards at least one coin when compound delta is positive but rounds to zero", () => {
    const bonus = computeCompoundContributorBonus(6, 0);
    expect(bonus).toBeGreaterThanOrEqual(1);
  });
});
