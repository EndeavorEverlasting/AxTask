import {
  classificationContributions,
  coinTransactions,
  communityReplies,
  rewardsCatalog,
  userAvatarSkills,
  userOfflineSkills,
  userRewards,
  users,
  wallets,
} from "@shared/schema";
import { and, eq, gt, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  combineLeaderboardRows,
  normalizeLeaderboardRows,
  skillTierFromLevels,
  type LeaderboardMetricRow,
} from "./leaderboard-ranking";

export type LeaderboardCategory = "coins" | "streak" | "contributions";
export type LeaderboardPeriod = "all" | "week";

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string | null;
  profileImageUrl: string | null;
  equippedTitle: string | null;
  skillTier: number;
  metricValue: number;
}

export interface LeaderboardResult {
  top25: LeaderboardEntry[];
  myEntry: LeaderboardEntry | null;
}

async function getLeaderboardMetricRows(
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
): Promise<LeaderboardMetricRow[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since = period === "week" ? weekAgo : new Date(0);

  if (category === "coins") {
    if (period === "all") {
      const rows = await db
        .select({ userId: wallets.userId, metricValue: wallets.lifetimeEarned })
        .from(wallets);
      return normalizeLeaderboardRows(rows);
    }

    const rows = await db
      .select({
        userId: coinTransactions.userId,
        metricValue: sql<number>`COALESCE(SUM(${coinTransactions.amount}), 0)::int`,
      })
      .from(coinTransactions)
      .where(and(gte(coinTransactions.createdAt, since), gt(coinTransactions.amount, 0)))
      .groupBy(coinTransactions.userId);
    return normalizeLeaderboardRows(rows);
  }

  if (category === "streak") {
    const metricColumn = period === "week" ? wallets.currentStreak : wallets.longestStreak;
    const rows = await db
      .select({ userId: wallets.userId, metricValue: metricColumn })
      .from(wallets);
    return normalizeLeaderboardRows(rows);
  }

  const replyRowsRaw = await db
    .select({
      userId: communityReplies.userId,
      metricValue: sql<number>`COUNT(*)::int`,
    })
    .from(communityReplies)
    .where(and(isNotNull(communityReplies.userId), gte(communityReplies.createdAt, since)))
    .groupBy(communityReplies.userId);

  const replyRows: LeaderboardMetricRow[] = replyRowsRaw
    .filter((row): row is { userId: string; metricValue: number } => Boolean(row.userId))
    .map((row) => ({ userId: row.userId, metricValue: Number(row.metricValue ?? 0) }));

  const classificationRows = await db
    .select({
      userId: classificationContributions.userId,
      metricValue: sql<number>`COUNT(*)::int`,
    })
    .from(classificationContributions)
    .where(gte(classificationContributions.createdAt, since))
    .groupBy(classificationContributions.userId);

  return combineLeaderboardRows(
    replyRows,
    classificationRows.map((row) => ({
      userId: row.userId,
      metricValue: Number(row.metricValue ?? 0),
    })),
  );
}

export async function getLeaderboard(
  requestingUserId: string,
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
): Promise<LeaderboardResult> {
  const metricRows = await getLeaderboardMetricRows(category, period);
  const positiveRows = metricRows.filter((row) => row.metricValue > 0);
  const top25Rows = positiveRows.slice(0, 25);
  const myMetricRow = metricRows.find((row) => row.userId === requestingUserId) ?? {
    userId: requestingUserId,
    metricValue: 0,
  };
  const myRank = positiveRows.filter((row) => row.metricValue > myMetricRow.metricValue).length + 1;
  const allUserIds = [...new Set([...top25Rows.map((row) => row.userId), requestingUserId])];

  const userRows = allUserIds.length
    ? await db
        .select({
          id: users.id,
          displayName: users.displayName,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(inArray(users.id, allUserIds))
    : [];

  const userRewardRows = allUserIds.length
    ? await db
        .select({ userId: userRewards.userId, rewardId: userRewards.rewardId })
        .from(userRewards)
        .where(and(inArray(userRewards.userId, allUserIds), eq(userRewards.isActive, true)))
    : [];

  const offlineSkillRows = allUserIds.length
    ? await db
        .select({ userId: userOfflineSkills.userId, level: userOfflineSkills.level })
        .from(userOfflineSkills)
        .where(inArray(userOfflineSkills.userId, allUserIds))
    : [];

  const avatarSkillRows = allUserIds.length
    ? await db
        .select({ userId: userAvatarSkills.userId, level: userAvatarSkills.level })
        .from(userAvatarSkills)
        .where(inArray(userAvatarSkills.userId, allUserIds))
    : [];

  const rewardIds = [...new Set(userRewardRows.map((row) => row.rewardId))];
  const catalogRows = rewardIds.length
    ? await db
        .select({ id: rewardsCatalog.id, type: rewardsCatalog.type, data: rewardsCatalog.data })
        .from(rewardsCatalog)
        .where(inArray(rewardsCatalog.id, rewardIds))
    : [];

  const userMap = new Map(userRows.map((row) => [row.id, row]));
  const activeRewardIdsByUser = new Map<string, Set<string>>();
  for (const row of userRewardRows) {
    const rewardIdsForUser = activeRewardIdsByUser.get(row.userId) ?? new Set<string>();
    rewardIdsForUser.add(row.rewardId);
    activeRewardIdsByUser.set(row.userId, rewardIdsForUser);
  }

  const titleMap = new Map<string, string | null>();
  for (const userId of allUserIds) {
    const activeRewardIds = activeRewardIdsByUser.get(userId) ?? new Set<string>();
    const titleReward = catalogRows.find(
      (reward) => reward.type === "title" && activeRewardIds.has(reward.id),
    );
    titleMap.set(userId, titleReward?.data ?? null);
  }

  const skillLevelsByUser = new Map<string, number>();
  for (const row of [...offlineSkillRows, ...avatarSkillRows]) {
    skillLevelsByUser.set(
      row.userId,
      (skillLevelsByUser.get(row.userId) ?? 0) + Number(row.level ?? 0),
    );
  }

  const makeEntry = (row: LeaderboardMetricRow, rank: number): LeaderboardEntry => {
    const user = userMap.get(row.userId);
    return {
      rank,
      userId: row.userId,
      displayName: user?.displayName ?? null,
      profileImageUrl: user?.profileImageUrl ?? null,
      equippedTitle: titleMap.get(row.userId) ?? null,
      skillTier: skillTierFromLevels(skillLevelsByUser.get(row.userId) ?? 0),
      metricValue: Number(row.metricValue ?? 0),
    };
  };

  return {
    top25: top25Rows.map((row, index) => makeEntry(row, index + 1)),
    myEntry: makeEntry(myMetricRow, myRank),
  };
}
