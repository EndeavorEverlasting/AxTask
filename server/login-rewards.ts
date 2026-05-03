import { eq } from "drizzle-orm";
import {
  avatarSkillNodes,
  offlineSkillNodes,
  userAvatarSkills,
  userOfflineSkills,
} from "@shared/schema";
import { db } from "./db";
import { addCoins, getOrCreateWallet } from "./storage";
import { countCoinEventsSince, countCoinEventsToday, ENGAGEMENT } from "./engagement-rewards";

type LoginRewardAward = {
  reason: string;
  coins: number;
};

export interface LoginRewardResult {
  awards: LoginRewardAward[];
  walletBalance: number;
  skillBonusPct: number;
}

const SKILL_BONUS_BY_EFFECT: Partial<Record<string, number>> = {
  rate_pct: 0.25,
  guidance_depth: 2,
  context_points: 1,
  resource_budget: 2,
  export_coin_discount: 0.5,
};

function scaledCoins(baseAmount: number, skillBonusPct: number): number {
  return Math.max(1, Math.round(baseAmount * (1 + (skillBonusPct / 100))));
}

export async function getLoginRewardSkillBonusPct(userId: string): Promise<number> {
  const [avatarRows, offlineRows] = await Promise.all([
    db
      .select({
        effectType: avatarSkillNodes.effectType,
        effectPerLevel: avatarSkillNodes.effectPerLevel,
        level: userAvatarSkills.level,
      })
      .from(userAvatarSkills)
      .innerJoin(avatarSkillNodes, eq(userAvatarSkills.skillNodeId, avatarSkillNodes.id))
      .where(eq(userAvatarSkills.userId, userId)),
    db
      .select({
        effectType: offlineSkillNodes.effectType,
        effectPerLevel: offlineSkillNodes.effectPerLevel,
        level: userOfflineSkills.level,
      })
      .from(userOfflineSkills)
      .innerJoin(offlineSkillNodes, eq(userOfflineSkills.skillNodeId, offlineSkillNodes.id))
      .where(eq(userOfflineSkills.userId, userId)),
  ]);

  const allRows = [...avatarRows, ...offlineRows];
  return allRows.reduce((acc, row) => {
    const multiplier = SKILL_BONUS_BY_EFFECT[row.effectType] ?? 0;
    if (multiplier <= 0) return acc;
    return acc + (row.level * row.effectPerLevel * multiplier);
  }, 0);
}

export async function awardLoginRewards(userId: string): Promise<LoginRewardResult | null> {
  const skillBonusPct = await getLoginRewardSkillBonusPct(userId);
  const awards: LoginRewardAward[] = [];

  const dailyUsed = await countCoinEventsToday(userId, ENGAGEMENT.dailyLogin.reason);
  if (dailyUsed < ENGAGEMENT.dailyLogin.dailyCap) {
    const dailyCoins = scaledCoins(ENGAGEMENT.dailyLogin.amount, skillBonusPct);
    await addCoins(
      userId,
      dailyCoins,
      ENGAGEMENT.dailyLogin.reason,
      `Daily login (${Math.round(skillBonusPct)}% skill bonus)`,
    );
    awards.push({ reason: ENGAGEMENT.dailyLogin.reason, coins: dailyCoins });
  }

  const since = new Date(Date.now() - (ENGAGEMENT.hourlyLogin.rollingHours * 60 * 60 * 1000));
  const hourlyUsed = await countCoinEventsSince(userId, ENGAGEMENT.hourlyLogin.reason, since);
  if (hourlyUsed < ENGAGEMENT.hourlyLogin.rollingCap) {
    const hourlyCoins = scaledCoins(ENGAGEMENT.hourlyLogin.amount, skillBonusPct);
    await addCoins(
      userId,
      hourlyCoins,
      ENGAGEMENT.hourlyLogin.reason,
      `Hourly login (${Math.round(skillBonusPct)}% skill bonus)`,
    );
    awards.push({ reason: ENGAGEMENT.hourlyLogin.reason, coins: hourlyCoins });
  }

  if (awards.length === 0) return null;
  const wallet = await getOrCreateWallet(userId);
  return {
    awards,
    walletBalance: wallet.balance,
    skillBonusPct: Math.round(skillBonusPct),
  };
}

