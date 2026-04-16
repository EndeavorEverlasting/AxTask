import { db } from "./db";
import { coinTransactions } from "@shared/schema";
import { eq, and, sql, count } from "drizzle-orm";
import { addCoins } from "./storage";

const utcDayClause = sql`(${coinTransactions.createdAt}::date) = (timezone('UTC', now()))::date`;

export async function countCoinEventsToday(userId: string, reason: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.reason, reason), utcDayClause));
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
  recalculate: { reason: "priority_recalculate_reward", amount: 2, dailyCap: 8 },
} as const;
