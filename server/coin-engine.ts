import { type Task, tasks } from "@shared/schema";
import { addCoins, updateStreak, awardBadge, getOrCreateWallet, getCompletedTaskCount, getUserBadges } from "./storage";
import { db } from "./db";
import { eq, and, sql, count } from "drizzle-orm";

const BASE_COINS: Record<string, number> = {
  Highest: 25,
  High: 20,
  "Medium-High": 15,
  Medium: 10,
  Low: 5,
};

const STREAK_BADGES: Record<number, string> = {
  3: "streak-3",
  7: "streak-7",
  14: "streak-14",
  30: "streak-30",
};

const COMPLETION_BADGES: Record<number, string> = {
  1: "first-task",
  10: "task-10",
  25: "task-25",
  50: "task-50",
  100: "task-100",
  500: "task-500",
};

export const BADGE_DEFINITIONS: Record<string, { name: string; description: string; icon: string }> = {
  "first-task": { name: "First Step", description: "Complete your first task", icon: "🎯" },
  "task-10": { name: "Getting Going", description: "Complete 10 tasks", icon: "🔥" },
  "task-25": { name: "Quarter Century", description: "Complete 25 tasks", icon: "💪" },
  "task-50": { name: "Half Century", description: "Complete 50 tasks", icon: "⚡" },
  "task-100": { name: "Centurion", description: "Complete 100 tasks", icon: "🏆" },
  "task-500": { name: "Task Legend", description: "Complete 500 tasks", icon: "👑" },
  "streak-3": { name: "3-Day Streak", description: "Complete tasks 3 days in a row", icon: "🔥" },
  "streak-7": { name: "Week Warrior", description: "7-day completion streak", icon: "⚔️" },
  "streak-14": { name: "Fortnight Force", description: "14-day completion streak", icon: "🛡️" },
  "streak-30": { name: "Monthly Master", description: "30-day completion streak", icon: "🌟" },
  "crisis-handler": { name: "Crisis Handler", description: "Complete 5 Highest-priority tasks", icon: "🚨" },
  "early-bird": { name: "Early Bird", description: "Complete a task before its due date", icon: "🐦" },
};

export interface CoinAwardResult {
  coinsEarned: number;
  newBalance: number;
  streak: number;
  badgesEarned: string[];
  breakdown: { label: string; amount: number }[];
}

export async function awardCoinsForCompletion(
  userId: string,
  task: Task,
  previousStatus: string
): Promise<CoinAwardResult | null> {
  if (previousStatus === "completed" || task.status !== "completed") return null;

  const wallet = await getOrCreateWallet(userId);
  const breakdown: { label: string; amount: number }[] = [];
  let totalCoins = 0;

  const base = BASE_COINS[task.priority] || 5;
  breakdown.push({ label: `${task.priority} priority`, amount: base });
  totalCoins += base;

  if (task.date) {
    const taskDate = new Date(task.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    taskDate.setHours(0, 0, 0, 0);
    if (taskDate >= today) {
      const onTimeBonus = Math.round(base * 0.5);
      breakdown.push({ label: "On-time bonus", amount: onTimeBonus });
      totalCoins += onTimeBonus;
    }
  }

  const updatedWallet = await updateStreak(userId);
  const streak = updatedWallet.currentStreak;

  if (streak >= 3) {
    const streakMultiplier = Math.min(streak, 30);
    const streakBonus = Math.round(base * (streakMultiplier * 0.1));
    if (streakBonus > 0) {
      breakdown.push({ label: `${streak}-day streak bonus`, amount: streakBonus });
      totalCoins += streakBonus;
    }
  }

  const { wallet: finalWallet } = await addCoins(userId, totalCoins, "task_completion", `Completed: ${task.activity.substring(0, 100)}`);

  const badgesEarned: string[] = [];

  const completedCount = await getCompletedTaskCount(userId);
  for (const [threshold, badgeId] of Object.entries(COMPLETION_BADGES)) {
    if (completedCount >= Number(threshold)) {
      const awarded = await awardBadge(userId, badgeId);
      if (awarded) {
        badgesEarned.push(badgeId);
        await addCoins(userId, 10, "badge_earned", `Badge: ${BADGE_DEFINITIONS[badgeId]?.name}`);
      }
    }
  }

  for (const [threshold, badgeId] of Object.entries(STREAK_BADGES)) {
    if (streak >= Number(threshold)) {
      const awarded = await awardBadge(userId, badgeId);
      if (awarded) {
        badgesEarned.push(badgeId);
        await addCoins(userId, 15, "streak_badge", `Streak Badge: ${BADGE_DEFINITIONS[badgeId]?.name}`);
      }
    }
  }

  if (task.priority === "Highest") {
    const [highestRow] = await db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, "completed"), eq(tasks.priority, "Highest")));
    if ((Number(highestRow?.value) || 0) >= 5) {
      const awarded = await awardBadge(userId, "crisis-handler");
      if (awarded) {
        badgesEarned.push("crisis-handler");
        await addCoins(userId, 20, "badge_earned", "Badge: Crisis Handler");
      }
    }
  }

  if (task.date) {
    const taskDate = new Date(task.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    taskDate.setHours(0, 0, 0, 0);
    if (taskDate > today) {
      const awarded = await awardBadge(userId, "early-bird");
      if (awarded) {
        badgesEarned.push("early-bird");
        await addCoins(userId, 10, "badge_earned", "Badge: Early Bird");
      }
    }
  }

  const refreshedWallet = await getOrCreateWallet(userId);

  return {
    coinsEarned: totalCoins,
    newBalance: refreshedWallet.balance,
    streak,
    badgesEarned,
    breakdown,
  };
}
