// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  computeGanttUnlock,
  type GanttPackRewardItem,
  type GanttPackUserRewardRef,
  type GanttPackAvatarProfile,
} from "./use-gantt-pack-unlocked";

/**
 * Mirrors the server-side unlock contract in storage.ts::redeemReward:
 *   - Redeemed gantt_pack items always unlock (reason: "redeemed").
 *   - Otherwise, any avatar at or above `unlockAtAvatarLevel` unlocks for free.
 *   - Neither condition => locked.
 *
 * Keeping these invariants in sync prevents a client from claiming "unlocked"
 * while the server still charges coins (or vice versa).
 */

const pack: GanttPackRewardItem = { id: "pack-1", type: "gantt_pack", unlockAtAvatarLevel: 3 };

describe("computeGanttUnlock", () => {
  it("returns locked when no rewards and no avatars qualify", () => {
    expect(computeGanttUnlock([], [], [])).toEqual({
      unlocked: false,
      reason: "locked",
      avatarLevel: 0,
    });
  });

  it("returns locked when avatars exist but are below threshold", () => {
    const avatars: GanttPackAvatarProfile[] = [{ level: 1 }, { level: 2 }];
    const result = computeGanttUnlock([pack], [], avatars);
    expect(result.unlocked).toBe(false);
    expect(result.reason).toBe("locked");
    expect(result.avatarLevel).toBe(2);
  });

  it("unlocks by avatar level when any avatar meets the threshold", () => {
    const avatars: GanttPackAvatarProfile[] = [{ level: 1 }, { level: 4 }];
    const result = computeGanttUnlock([pack], [], avatars);
    expect(result).toEqual({ unlocked: true, reason: "avatar-level", avatarLevel: 4 });
  });

  it("unlocks by redemption and takes precedence over avatar-level", () => {
    const avatars: GanttPackAvatarProfile[] = [{ level: 5 }];
    const myRewards: GanttPackUserRewardRef[] = [{ id: "ur-1", rewardId: "pack-1" }];
    const result = computeGanttUnlock([pack], myRewards, avatars);
    expect(result).toEqual({ unlocked: true, reason: "redeemed", avatarLevel: 5 });
  });

  it("ignores non-gantt_pack catalog items", () => {
    const otherPack: GanttPackRewardItem = {
      id: "theme-1",
      type: "theme",
      unlockAtAvatarLevel: 1,
    };
    const avatars: GanttPackAvatarProfile[] = [{ level: 5 }];
    const result = computeGanttUnlock([otherPack], [], avatars);
    expect(result.unlocked).toBe(false);
  });

  it("ignores redemptions of non-gantt_pack items", () => {
    const otherPack: GanttPackRewardItem = { id: "theme-1", type: "theme", unlockAtAvatarLevel: null };
    const myRewards: GanttPackUserRewardRef[] = [{ id: "ur-1", rewardId: "theme-1" }];
    const result = computeGanttUnlock([pack, otherPack], myRewards, []);
    expect(result.unlocked).toBe(false);
  });

  it("treats unlockAtAvatarLevel: null as never auto-unlocking", () => {
    const lockedPack: GanttPackRewardItem = {
      id: "pack-1",
      type: "gantt_pack",
      unlockAtAvatarLevel: null,
    };
    const avatars: GanttPackAvatarProfile[] = [{ level: 99 }];
    const result = computeGanttUnlock([lockedPack], [], avatars);
    expect(result.unlocked).toBe(false);
  });
});
