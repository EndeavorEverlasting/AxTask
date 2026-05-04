import { db } from "./db";
import { coinTransactions } from "@shared/schema";
import { eq, and, sql, count, gte } from "drizzle-orm";
import { addCoins } from "./storage";

const utcDayClause = sql`(${coinTransactions.createdAt}::date) = (timezone('UTC', now()))::date`;

export async function countCoinEventsToday(userId: string, reason: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.reason, reason), utcDayClause));
  return Number(row?.value) || 0;
}

export async function countCoinEventsSince(userId: string, reason: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(
      and(
        eq(coinTransactions.userId, userId),
        eq(coinTransactions.reason, reason),
        gte(coinTransactions.createdAt, since),
      ),
    );
  return Number(row?.value) || 0;
}

/**
 * Adds coins if the user has not hit the daily cap for this reason (UTC day).
 * Used for lightweight engagement rewards (search, new unique task, recalculate).
 */
export async function tryCappedCoinAward(params: {
  userId: string;
  reason: string;
  amount: number;
  details: string;
  dailyCap: number;
  taskId?: string;
}): Promise<{ coins: number; newBalance: number } | null> {
  const used = await countCoinEventsToday(params.userId, params.reason);
  if (used >= params.dailyCap) return null;
  const { wallet } = await addCoins(params.userId, params.amount, params.reason, params.details, params.taskId);
  return { coins: params.amount, newBalance: wallet.balance };
}

export const ENGAGEMENT = {
  uniqueTaskCreate: { reason: "unique_task_create", amount: 3, dailyCap: 40 },
  taskSearch: { reason: "task_search_reward", amount: 1, dailyCap: 30 },
  dailyLogin: { reason: "daily_login_reward", amount: 8, dailyCap: 1 },
  hourlyLogin: { reason: "hourly_login_reward", amount: 2, rollingHours: 1, rollingCap: 1 },
  organizationFilterFollowthrough: {
    reason: "organization_filter_followthrough_reward",
    amount: 4,
    dailyCap: 20,
  },
  organizationAptitudePoints: {
    reason: "organization_aptitude_points",
    pointsPerEvent: 5,
  },
  headerInteraction: {
    reason: "task_header_interaction_reward",
    amount: 1,
    dailyCap: 30,
  },
  recalculate: { reason: "priority_recalculate_reward", amount: 2, dailyCap: 8 },
  feedbackSubmission: { reason: "feedback_submission_reward", amount: 3, dailyCap: 5 },
  recalculateRating: { reason: "urgency_recalculate_rating_reward", amount: 2, dailyCap: 6 },
  consensusTierBonus: { reason: "classification_consensus_tier_bonus", amount: 3, dailyCap: 8 },
  classificationCorrectionConsensus: {
    reason: "classification_correction_consensus_reward",
    amount: 4,
    dailyCap: 10,
  },
  /** One grant per rolling 7-day window per user (all archetype polls share this cap). */
  archetypePollVote: {
    reason: "archetype_poll_vote_reward",
    amount: 2,
    weeklyCap: 1,
  },
  /** Capped drip for substantive voice intents (see `server/voice-companion-rewards.ts`). */
  voiceCommandCompanion: {
    reason: "voice_command_companion_reward",
    amount: 1,
    dailyCap: 24,
  },
} as const;
