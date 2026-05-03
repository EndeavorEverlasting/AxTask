import { useQuery } from "@tanstack/react-query";
import type { ArchetypeContinuumDto } from "@shared/archetype-continuum-dto";

export interface GanttPackRewardItem {
  id: string;
  type: string;
  unlockAtAvatarLevel?: number | null;
}

export interface GanttPackUserRewardRef {
  id: string;
  rewardId: string;
}

export interface GanttPackAvatarProfile {
  level: number;
}

export interface GanttPackUnlockResult {
  unlocked: boolean;
  reason: "redeemed" | "avatar-level" | "locked";
  avatarLevel: number;
}

/**
 * Pure unlock decision: kept separate from the hook so it can be unit-tested
 * without spinning up a QueryClient. Mirrors the server-side contract in
 * storage.ts::redeemReward — redeemed items always unlock, and an avatar at or
 * above the pack's threshold grants free access.
 */
export function computeGanttUnlock(
  rewards: GanttPackRewardItem[],
  myRewards: GanttPackUserRewardRef[],
  avatars: GanttPackAvatarProfile[],
): GanttPackUnlockResult {
  const ganttPackItems = rewards.filter((r) => r.type === "gantt_pack");
  const maxAvatarLevel = Math.max(0, ...avatars.map((a) => a.level));
  const ownedRewardIds = new Set(myRewards.map((r) => r.rewardId));

  const redeemed = ganttPackItems.some((r) => ownedRewardIds.has(r.id));
  const byLevel = ganttPackItems.some(
    (r) => typeof r.unlockAtAvatarLevel === "number" && maxAvatarLevel >= r.unlockAtAvatarLevel,
  );

  if (redeemed) return { unlocked: true, reason: "redeemed", avatarLevel: maxAvatarLevel };
  if (byLevel) return { unlocked: true, reason: "avatar-level", avatarLevel: maxAvatarLevel };
  return { unlocked: false, reason: "locked", avatarLevel: maxAvatarLevel };
}

interface AvatarsResponse {
  avatars: GanttPackAvatarProfile[];
  archetypeContinuum?: ArchetypeContinuumDto;
}

/**
 * Returns whether the Gantt customization pack is unlocked for the current user.
 *
 * Unlocked when either:
 * - The user has redeemed a catalog item with `type === "gantt_pack"`, or
 * - Any of their avatar profiles is at or above the pack's `unlockAtAvatarLevel`
 *   (matches the free-at-level unlock contract in server/storage.ts).
 */
export function useGanttPackUnlocked(): GanttPackUnlockResult {
  const { data: rewards = [] } = useQuery<GanttPackRewardItem[]>({
    queryKey: ["/api/gamification/rewards"],
    staleTime: 5 * 60_000,
  });
  const { data: myRewards = [] } = useQuery<GanttPackUserRewardRef[]>({
    queryKey: ["/api/gamification/my-rewards"],
    staleTime: 60_000,
  });
  const { data: avatarData } = useQuery<AvatarsResponse>({
    queryKey: ["/api/gamification/avatars"],
    staleTime: 60_000,
  });

  return computeGanttUnlock(rewards, myRewards, avatarData?.avatars ?? []);
}
