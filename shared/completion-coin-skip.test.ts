// @vitest-environment node
import { describe, expect, it } from "vitest";
import { completionCoinSkipReason } from "./completion-coin-skip";

describe("completionCoinSkipReason", () => {
  it("returns null when not transitioning into completed", () => {
    expect(
      completionCoinSkipReason({
        previousStatus: "pending",
        taskStatus: "pending",
        coinReward: null,
        alreadyAwarded: true,
      }),
    ).toBeNull();
  });

  it("returns null when coins were awarded", () => {
    expect(
      completionCoinSkipReason({
        previousStatus: "pending",
        taskStatus: "completed",
        coinReward: { coinsEarned: 5, newBalance: 40, streak: 1, badgesEarned: [], breakdown: [] },
        alreadyAwarded: true,
      }),
    ).toBeNull();
  });

  it("returns already_awarded when no reward but ledger says paid", () => {
    expect(
      completionCoinSkipReason({
        previousStatus: "pending",
        taskStatus: "completed",
        coinReward: null,
        alreadyAwarded: true,
      }),
    ).toBe("already_awarded");
  });

  it("returns not_awarded when no reward and not yet on ledger", () => {
    expect(
      completionCoinSkipReason({
        previousStatus: "pending",
        taskStatus: "completed",
        coinReward: null,
        alreadyAwarded: false,
      }),
    ).toBe("not_awarded");
  });
});
