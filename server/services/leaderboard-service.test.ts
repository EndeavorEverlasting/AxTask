import { describe, expect, it } from "vitest";
import {
  combineLeaderboardRows,
  normalizeLeaderboardRows,
  skillTierFromLevels,
} from "./leaderboard-service";

describe("leaderboard ranking helpers", () => {
  it("normalizes numbers and uses user id as a deterministic tie break", () => {
    expect(
      normalizeLeaderboardRows([
        { userId: "user-b", metricValue: 5 },
        { userId: "user-a", metricValue: 5 },
        { userId: "user-c", metricValue: 12 },
      ]),
    ).toEqual([
      { userId: "user-c", metricValue: 12 },
      { userId: "user-a", metricValue: 5 },
      { userId: "user-b", metricValue: 5 },
    ]);
  });

  it("combines contribution sources before ranking", () => {
    expect(
      combineLeaderboardRows(
        [
          { userId: "user-a", metricValue: 3 },
          { userId: "user-b", metricValue: 2 },
        ],
        [
          { userId: "user-a", metricValue: 4 },
          { userId: "user-c", metricValue: 6 },
        ],
      ),
    ).toEqual([
      { userId: "user-a", metricValue: 7 },
      { userId: "user-c", metricValue: 6 },
      { userId: "user-b", metricValue: 2 },
    ]);
  });

  it("maps accumulated skill levels to stable public tiers", () => {
    expect(skillTierFromLevels(0)).toBe(0);
    expect(skillTierFromLevels(2)).toBe(0);
    expect(skillTierFromLevels(3)).toBe(1);
    expect(skillTierFromLevels(9)).toBe(1);
    expect(skillTierFromLevels(10)).toBe(2);
  });
});
