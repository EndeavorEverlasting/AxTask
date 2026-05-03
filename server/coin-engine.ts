import { type Task, tasks, taskCollaborators, coinTransactions, classificationContributions, wallets } from "@shared/schema";
import { addCoins, updateStreak, awardBadge, getOrCreateWallet, getCompletedTaskCount, getUserBadges, hasTaskBeenAwarded, getTaskCollaborators, getSkillUnlocks } from "./storage";
import { db } from "./db";
import { eq, and, or, isNull, ne, sql, count, countDistinct } from "drizzle-orm";
import { SKILL_NODE_REQUIRED_TASKS } from "@shared/skill-nodes";
import { SKILL_BENEFITS, type SkillBenefit } from "@shared/skill-benefits";

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

const COLLAB_COINS = {
  SHARE_TASK: 5,
  COLLAB_COMPLETION_BONUS: 8,
  FIRST_COLLAB_SHARE: 10,
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
  "team-player": { name: "Team Player", description: "Share your first task with a collaborator", icon: "🤝" },
  "collab-5": { name: "Collaborator", description: "Share 5 tasks with others", icon: "👥" },
  "collab-25": { name: "Team Leader", description: "Share 25 tasks with others", icon: "🌐" },
};

export interface ActiveSkillBonus {
  skillId: string;
  active: boolean;
  requiredTasks: number;
  benefit: SkillBenefit | null;
}

/**
 * Returns the set of active skill IDs for a user, derived directly from their
 * completed task count — NOT from skill_unlock records — so benefits apply
 * automatically as soon as the user crosses each task threshold.
 */
export async function getActiveSkillIds(userId: string): Promise<Set<string>> {
  const completedCount = await getCompletedTaskCount(userId);
  const active = new Set<string>();
  for (const [nodeId, required] of Object.entries(SKILL_NODE_REQUIRED_TASKS)) {
    if (completedCount >= required) active.add(nodeId);
  }
  return active;
}

/**
 * Returns full active bonus info for all skill nodes — used by the /api/gamification/active-bonuses endpoint.
 * Includes benefit metadata from the shared SKILL_BENEFITS catalogue.
 */
export async function getActiveSkillBonuses(userId: string): Promise<ActiveSkillBonus[]> {
  const activeIds = await getActiveSkillIds(userId);
  return Object.entries(SKILL_NODE_REQUIRED_TASKS).map(([skillId, requiredTasks]) => ({
    skillId,
    active: activeIds.has(skillId),
    requiredTasks,
    benefit: SKILL_BENEFITS[skillId] ?? null,
  }));
}

/**
 * If the user has discipline-2 unlocked and hasn't received the monthly free shield for the
 * current month, credit it now and record the month so it isn't credited again.
 */
export async function maybeGrantMonthlyShield(userId: string, activeIds: Set<string>): Promise<boolean> {
  if (!activeIds.has("discipline-2")) return false;

  await getOrCreateWallet(userId);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Atomic single-statement conditional update: only succeeds if month hasn't been credited
  // AND shields are below the cap. Concurrent calls will find 0 rows affected and skip.
  const result = await db.update(wallets)
    .set({
      streakShields: sql`${wallets.streakShields} + 1`,
      lastShieldCreditMonth: currentMonth,
    })
    .where(and(
      eq(wallets.userId, userId),
      or(isNull(wallets.lastShieldCreditMonth), ne(wallets.lastShieldCreditMonth, currentMonth)),
      sql`${wallets.streakShields} < 3`
    ))
    .returning({ streakShields: wallets.streakShields });

  if (result.length === 0) return false;

  await addCoins(userId, 0, "monthly_shield_credit", "Monthly free streak shield (Discipline II)");
  return true;
}

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

  if (task.forceImported) return null;

  const alreadyAwarded = await hasTaskBeenAwarded(userId, task.id);
  if (alreadyAwarded) return null;

  const activeIds = await getActiveSkillIds(userId);

  await getOrCreateWallet(userId);
  const breakdown: { label: string; amount: number }[] = [];
  let totalCoins = 0;

  let base = BASE_COINS[task.priority] || 5;

  if (activeIds.has("discipline-1")) {
    const bonus = Math.round(base * 0.1);
    base += bonus;
  }

  breakdown.push({ label: `${task.priority} priority`, amount: base });
  totalCoins += base;

  if (task.date) {
    const taskDate = new Date(task.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    taskDate.setHours(0, 0, 0, 0);
    if (taskDate >= today) {
      const onTimeRate = activeIds.has("planning-1") ? 0.65 : 0.5;
      const onTimeBonus = Math.round(base * onTimeRate);
      breakdown.push({ label: "On-time bonus", amount: onTimeBonus });
      totalCoins += onTimeBonus;
    }
  }

  const updatedWallet = await updateStreak(userId);
  const streak = updatedWallet.currentStreak;

  const streakThreshold = activeIds.has("focus-1") ? 2 : 3;
  const streakCap = activeIds.has("discipline-2") ? 40 : 30;

  if (streak >= streakThreshold) {
    const streakMultiplier = Math.min(streak, streakCap);
    const streakBonus = Math.round(base * (streakMultiplier * 0.1));
    if (streakBonus > 0) {
      breakdown.push({ label: `${streak}-day streak bonus`, amount: streakBonus });
      totalCoins += streakBonus;
    }
  }

  if (activeIds.has("systems-2")) {
    const globalBonus = Math.round(totalCoins * 0.15);
    if (globalBonus > 0) {
      breakdown.push({ label: "Systems II global bonus (+15%)", amount: globalBonus });
      totalCoins += globalBonus;
    }
  }

  const { wallet: finalWallet } = await addCoins(userId, totalCoins, "task_completion", `Completed: ${task.activity.substring(0, 100)}`, task.id);

  const badgesEarned: string[] = [];
  // Base badge coin amounts; apply Systems II 15% global multiplier if active
  const baseBadgeCoinAmount = activeIds.has("focus-2") ? 18 : 10;
  const badgeCoinAmount = activeIds.has("systems-2") ? Math.round(baseBadgeCoinAmount * 1.15) : baseBadgeCoinAmount;
  // systems-2 raises streak badge award to a fixed 25 (not a % calculation)
  const streakBadgeCoinAmount = activeIds.has("systems-2") ? 25 : 15;

  const completedCount = await getCompletedTaskCount(userId);
  for (const [threshold, badgeId] of Object.entries(COMPLETION_BADGES)) {
    if (completedCount >= Number(threshold)) {
      const awarded = await awardBadge(userId, badgeId);
      if (awarded) {
        badgesEarned.push(badgeId);
        await addCoins(userId, badgeCoinAmount, "badge_earned", `Badge: ${BADGE_DEFINITIONS[badgeId]?.name}`);
      }
    }
  }

  for (const [threshold, badgeId] of Object.entries(STREAK_BADGES)) {
    if (streak >= Number(threshold)) {
      const awarded = await awardBadge(userId, badgeId);
      if (awarded) {
        badgesEarned.push(badgeId);
        await addCoins(userId, streakBadgeCoinAmount, "streak_badge", `Streak Badge: ${BADGE_DEFINITIONS[badgeId]?.name}`);
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
        // crisis-handler has a higher base of 20 coins; focus-2 only raises the standard 10-coin base.
        // systems-2 global +15% still applies on top of the 20-coin floor.
        const crisisHandlerCoins = activeIds.has("systems-2") ? Math.round(20 * 1.15) : 20;
        await addCoins(userId, crisisHandlerCoins, "badge_earned", "Badge: Crisis Handler");
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
        await addCoins(userId, badgeCoinAmount, "badge_earned", "Badge: Early Bird");
      }
    }
  }

  const collabs = await getTaskCollaborators(task.id);
  if (collabs.length > 0) {
    const baseCollabBonus = COLLAB_COINS.COLLAB_COMPLETION_BONUS;
    const collabBonus = activeIds.has("systems-2") ? Math.round(baseCollabBonus * 1.15) : baseCollabBonus;
    breakdown.push({ label: "Collaboration bonus", amount: collabBonus });
    totalCoins += collabBonus;
    await addCoins(userId, collabBonus, "collab_completion_bonus", `Collaboration bonus for shared task`, task.id);
  }

  await maybeGrantMonthlyShield(userId, activeIds);

  const refreshedWallet = await getOrCreateWallet(userId);

  return {
    coinsEarned: totalCoins,
    newBalance: refreshedWallet.balance,
    streak,
    badgesEarned,
    breakdown,
  };
}

const CLEANUP_BONUS_COINS_BASE = 4;
const CLEANUP_STALE_DAYS_BASE = 7;

export interface CleanupBonusResult {
  coinsEarned: number;
  newBalance: number;
}

export async function awardCleanupBonus(
  userId: string,
  task: Task,
  preUpdateTask?: { createdAt: Date | null; updatedAt: Date | null }
): Promise<CleanupBonusResult | null> {
  if (task.forceImported) return null;

  const ref = preUpdateTask || task;
  if (!ref.createdAt) return null;

  const activeIds = await getActiveSkillIds(userId);
  const cleanupBonusCoins = activeIds.has("systems-1") ? 6 : CLEANUP_BONUS_COINS_BASE;
  const cleanupStaleDays = activeIds.has("systems-1") ? 5 : CLEANUP_STALE_DAYS_BASE;

  const staleRef = ref.updatedAt ? new Date(ref.updatedAt) : new Date(ref.createdAt);
  const now = new Date();
  const ageInDays = Math.floor((now.getTime() - staleRef.getTime()) / (1000 * 60 * 60 * 24));
  if (ageInDays < cleanupStaleDays) return null;

  const [existing] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(and(
      eq(coinTransactions.taskId, task.id),
      eq(coinTransactions.reason, "cleanup_bonus")
    ));
  if (Number(existing?.value) > 0) return null;

  await getOrCreateWallet(userId);
  // Apply Systems II +15% global multiplier to cleanup bonus if active
  const effectiveCleanupCoins = activeIds.has("systems-2") ? Math.round(cleanupBonusCoins * 1.15) : cleanupBonusCoins;
  const { wallet } = await addCoins(
    userId,
    effectiveCleanupCoins,
    "cleanup_bonus",
    `Cleanup: updated stale task (${ageInDays} days old)`,
    task.id
  );

  const [existingContrib] = await db
    .select()
    .from(classificationContributions)
    .where(and(
      eq(classificationContributions.taskId, task.id),
      eq(classificationContributions.userId, userId)
    ));

  if (existingContrib) {
    await db
      .update(classificationContributions)
      .set({
        cleanupBonuses: sql`${classificationContributions.cleanupBonuses} + 1`,
        totalCoinsEarned: sql`${classificationContributions.totalCoinsEarned} + ${effectiveCleanupCoins}`,
      })
      .where(eq(classificationContributions.id, existingContrib.id));
  } else {
    await db.insert(classificationContributions).values({
      taskId: task.id,
      userId,
      classification: task.classification || "General",
      baseCoinsAwarded: 0,
      totalCoinsEarned: effectiveCleanupCoins,
      cleanupBonuses: 1,
    });
  }

  return {
    coinsEarned: effectiveCleanupCoins,
    newBalance: wallet.balance,
  };
}

export async function getCleanupStats(userId: string): Promise<{
  totalCleanups: number;
  totalCleanupCoins: number;
}> {
  const [row] = await db
    .select({
      totalCleanups: count(),
      totalCleanupCoins: sql<number>`COALESCE(SUM(${coinTransactions.amount}), 0)`,
    })
    .from(coinTransactions)
    .where(and(
      eq(coinTransactions.userId, userId),
      eq(coinTransactions.reason, "cleanup_bonus")
    ));

  return {
    totalCleanups: Number(row?.totalCleanups) || 0,
    totalCleanupCoins: Number(row?.totalCleanupCoins) || 0,
  };
}

export interface CollabRewardResult {
  coinsEarned: number;
  newBalance: number;
  badgesEarned: string[];
}

async function getUserShareCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: countDistinct(taskCollaborators.taskId) })
    .from(taskCollaborators)
    .where(eq(taskCollaborators.invitedBy, userId));
  return Number(row?.value) || 0;
}

const COLLAB_BADGES: Record<number, string> = {
  1: "team-player",
  5: "collab-5",
  25: "collab-25",
};

export async function awardCoinsForSharing(
  userId: string,
  taskId: string,
  collaboratorEmail: string
): Promise<CollabRewardResult | null> {
  const [existing] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(and(
      eq(coinTransactions.userId, userId),
      eq(coinTransactions.taskId, taskId),
      eq(coinTransactions.reason, "collaboration_share")
    ));
  if (Number(existing?.value) > 0) return null;

  const activeIds = await getActiveSkillIds(userId);

  await getOrCreateWallet(userId);
  const baseShareCoins = COLLAB_COINS.SHARE_TASK;
  const shareCoins = activeIds.has("systems-2") ? Math.round(baseShareCoins * 1.15) : baseShareCoins;
  let totalCoins = shareCoins;

  await addCoins(userId, shareCoins, "collaboration_share", `Shared task with ${collaboratorEmail}`, taskId);

  const badgesEarned: string[] = [];
  const shareCount = await getUserShareCount(userId);

  // Respect focus-2 (18 per badge) and systems-2 (+15%) for badge coins
  const baseBadgeCoinAmount = activeIds.has("focus-2") ? 18 : 10;
  const badgeCoinAmount = activeIds.has("systems-2") ? Math.round(baseBadgeCoinAmount * 1.15) : baseBadgeCoinAmount;

  for (const [threshold, badgeId] of Object.entries(COLLAB_BADGES)) {
    if (shareCount >= Number(threshold)) {
      const awarded = await awardBadge(userId, badgeId);
      if (awarded) {
        badgesEarned.push(badgeId);
        // team-player first-collab bonus also respects systems-2 multiplier
        const baseSpecialCoins = badgeId === "team-player" ? COLLAB_COINS.FIRST_COLLAB_SHARE : baseBadgeCoinAmount;
        const badgeCoins = badgeId === "team-player"
          ? (activeIds.has("systems-2") ? Math.round(baseSpecialCoins * 1.15) : baseSpecialCoins)
          : badgeCoinAmount;
        await addCoins(userId, badgeCoins, "badge_earned", `Badge: ${BADGE_DEFINITIONS[badgeId]?.name}`);
        totalCoins += badgeCoins;
      }
    }
  }

  const refreshedWallet = await getOrCreateWallet(userId);

  return {
    coinsEarned: totalCoins,
    newBalance: refreshedWallet.balance,
    badgesEarned,
  };
}
