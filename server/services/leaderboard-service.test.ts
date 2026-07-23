import { describe, expect, it } from "vitest";
import { skillTierFromLevels } from "./leaderboard-ranking";

describe("leaderboard ranking helpers", () => {
  it("maps accumulated skill levels to stable public tiers", () => {
    expect(skillTierFromLevels(0)).toBe(0);
    expect(skillTierFromLevels(2)).toBe(0);
    expect(skillTierFromLevels(3)).toBe(1);
    expect(skillTierFromLevels(9)).toBe(1);
    expect(skillTierFromLevels(10)).toBe(2);
  });
});
