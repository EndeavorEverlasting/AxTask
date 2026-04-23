import type { EngineResponse } from "./engines/dispatcher";
import { ENGAGEMENT, tryCappedCoinAward, countCoinEventsToday } from "./engagement-rewards";
import {
  getAvatarProfiles,
  selectDominantAvatarProfile,
  applyVoiceAvatarXpWithTick,
} from "./storage";

/** Zero-amount rows used only with `countCoinEventsToday` for UTC-day XP caps. */
export const VOICE_AVATAR_XP_TICK_REASON = "voice_avatar_xp_tick";

const VOICE_AVATAR_XP_PER_EVENT = 3;
const VOICE_AVATAR_XP_DAILY_CAP = 12;

export type VoiceCompanionRewardPayload = {
  avatarKey: string;
  displayName: string;
  coinsAwarded?: number;
  xpAwarded?: number;
  avatarLevel?: number;
};

export function voiceDispatchQualifiesForCompanionRewards(result: EngineResponse): boolean {
  const { intent, action, payload } = result;
  if (intent === "navigation") return false;
  if (intent === "task_create") return true;
  if (intent === "planner_query") return true;
  if (intent === "calendar_command") {
    if (action === "navigate" && payload && (payload as { path?: string }).path === "/calendar") {
      return false;
    }
    return true;
  }
  if (intent === "task_review") {
    const actions = (payload as { actions?: unknown }).actions;
    return Array.isArray(actions) && actions.length > 0;
  }
  if (intent === "search") {
    const q = (payload as { query?: unknown }).query;
    return typeof q === "string" && q.trim().length > 0;
  }
  if (intent === "alarm_config") {
    return action === "alarm_create_for_task";
  }
  return false;
}

/**
 * After a successful voice dispatch, optionally grant capped AxCoins + avatar XP
 * on the dominant companion profile. Returns a payload only when at least one
 * grant occurred.
 */
export async function applyVoiceCompanionRewards(
  userId: string,
  result: EngineResponse,
): Promise<VoiceCompanionRewardPayload | null> {
  if (!voiceDispatchQualifiesForCompanionRewards(result)) return null;

  const profiles = await getAvatarProfiles(userId);
  const dominant = selectDominantAvatarProfile(profiles);
  if (!dominant) return null;

  let coinsAwarded = 0;
  const coinEntry = ENGAGEMENT.voiceCommandCompanion;
  const coinTry = await tryCappedCoinAward({
    userId,
    reason: coinEntry.reason,
    amount: coinEntry.amount,
    details: `voice:${result.intent}`,
    dailyCap: coinEntry.dailyCap,
  });
  if (coinTry) coinsAwarded = coinTry.coins;

  let xpAwarded = 0;
  const xpUsed = await countCoinEventsToday(userId, VOICE_AVATAR_XP_TICK_REASON);
  if (xpUsed < VOICE_AVATAR_XP_DAILY_CAP) {
    const xpRow = await applyVoiceAvatarXpWithTick({
      userId,
      profileId: dominant.id,
      xpGain: VOICE_AVATAR_XP_PER_EVENT,
      tickReason: VOICE_AVATAR_XP_TICK_REASON,
      tickDetails: `voice:${result.intent}`,
    });
    if (xpRow) xpAwarded = VOICE_AVATAR_XP_PER_EVENT;
  }

  if (coinsAwarded <= 0 && xpAwarded <= 0) return null;

  const refreshed = await getAvatarProfiles(userId);
  const updated = refreshed.find((p) => p.id === dominant.id);

  return {
    avatarKey: dominant.avatarKey,
    displayName: dominant.displayName,
    ...(coinsAwarded > 0 ? { coinsAwarded } : {}),
    ...(xpAwarded > 0 ? { xpAwarded } : {}),
    ...(updated ? { avatarLevel: updated.level } : {}),
  };
}
