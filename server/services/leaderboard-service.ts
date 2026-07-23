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
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { skillTierFromLevels } from "./leaderboard-ranking";

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

type RankedMetricRow = {
  user_id: string;
  metric_value: string | number | bigint;
  rank: string | number | bigint;
};

function metricRowsSql(
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
  weekAgo: Date,
): SQL {
  if (category === "coins") {
    if (period === "all") {
      return sql`
        SELECT
          ${wallets.userId}::text AS user_id,
          ${wallets.lifetimeEarned}::bigint AS metric_value
        FROM ${wallets}
      `;
    }

    return sql`
      SELECT
        ${coinTransactions.userId}::text AS user_id,
        COALESCE(SUM(${coinTransactions.amount}), 0)::bigint AS metric_value
      FROM ${coinTransactions}
      WHERE ${coinTransactions.createdAt} >= ${weekAgo}
        AND ${coinTransactions.amount} > 0
      GROUP BY ${coinTransactions.userId}
    `;
  }

  if (category === "streak") {
    const metricColumn = period === "week" ? wallets.currentStreak : wallets.longestStreak;
    return sql`
      SELECT
        ${wallets.userId}::text AS user_id,
        ${metricColumn}::bigint AS metric_value
      FROM ${wallets}
    `;
  }

  const replyPeriodFilter = period === "week"
    ? sql`AND ${communityReplies.createdAt} >= ${weekAgo}`
    : sql``;
  const classificationPeriodFilter = period === "week"
    ? sql`WHERE ${classificationContributions.createdAt} >= ${weekAgo}`
    : sql``;

  return sql`
    SELECT user_id, SUM(metric_value)::bigint AS metric_value
    FROM (
      SELECT
        ${communityReplies.userId}::text AS user_id,
        COUNT(*)::bigint AS metric_value
      FROM ${communityReplies}
      WHERE ${communityReplies.userId} IS NOT NULL
        ${replyPeriodFilter}
      GROUP BY ${communityReplies.userId}

      UNION ALL

      SELECT
        ${classificationContributions.userId}::text AS user_id,
        COUNT(*)::bigint AS metric_value
      FROM ${classificationContributions}
      ${classificationPeriodFilter}
      GROUP BY ${classificationContributions.userId}
    ) contribution_sources
    GROUP BY user_id
  `;
}

function resultRows<T>(result: unknown): T[] {
  const rows = (result as { rows?: T[] })?.rows;
  if (Array.isArray(rows)) return rows;
  return Array.isArray(result) ? result as T[] : [];
}

async function getSelectedMetricRows(
  requestingUserId: string,
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
): Promise<Array<{ userId: string; metricValue: number; rank: number }>> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const metrics = metricRowsSql(category, period, weekAgo);

  const result = await db.execute(sql<RankedMetricRow>`
    WITH metrics AS (
      ${metrics}
    ), metric_rows AS (
      SELECT user_id::text AS user_id, metric_value::bigint AS metric_value
      FROM metrics

      UNION ALL

      SELECT (${requestingUserId})::text AS user_id, 0::bigint AS metric_value
      WHERE NOT EXISTS (
        SELECT 1 FROM metrics WHERE user_id::text = (${requestingUserId})::text
      )
    ), ranked AS (
      SELECT
        user_id,
        metric_value,
        ROW_NUMBER() OVER (
          ORDER BY metric_value DESC, user_id ASC
        )::int AS rank
      FROM metric_rows
    ), top_rows AS (
      SELECT user_id, metric_value, rank
      FROM ranked
      WHERE metric_value > 0
      ORDER BY rank
      LIMIT 25
    )
    SELECT user_id, metric_value, rank
    FROM top_rows

    UNION

    SELECT user_id, metric_value, rank
    FROM ranked
    WHERE user_id = (${requestingUserId})::text

    ORDER BY rank
  `);

  return resultRows<RankedMetricRow>(result).map((row) => ({
    userId: String(row.user_id),
    metricValue: Number(row.metric_value ?? 0),
    rank: Number(row.rank ?? 0),
  }));
}

export async function getLeaderboard(
  requestingUserId: string,
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
): Promise<LeaderboardResult> {
  const selectedMetricRows = await getSelectedMetricRows(requestingUserId, category, period);
  const myMetricRow = selectedMetricRows.find((row) => row.userId === requestingUserId) ?? null;
  const top25Rows = selectedMetricRows.filter(
    (row) => row.metricValue > 0 && row.rank <= 25,
  );
  const allUserIds = [...new Set(selectedMetricRows.map((row) => row.userId))];

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

  const makeEntry = (row: { userId: string; metricValue: number; rank: number }): LeaderboardEntry => {
    const user = userMap.get(row.userId);
    return {
      rank: row.rank,
      userId: row.userId,
      displayName: user?.displayName ?? null,
      profileImageUrl: user?.profileImageUrl ?? null,
      equippedTitle: titleMap.get(row.userId) ?? null,
      skillTier: skillTierFromLevels(skillLevelsByUser.get(row.userId) ?? 0),
      metricValue: row.metricValue,
    };
  };

  return {
    top25: top25Rows.map(makeEntry),
    myEntry: myMetricRow ? makeEntry(myMetricRow) : null,
  };
}
