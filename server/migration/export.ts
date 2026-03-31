import { db } from "../db";
import {
  users, tasks, passwordResetTokens, securityLogs,
  wallets, coinTransactions, userBadges, rewardsCatalog,
  userRewards, taskCollaborators, taskPatterns,
  classificationContributions, classificationConfirmations,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export interface ExportMetadata {
  schemaVersion: number;
  exportedAt: string;
  exportMode: "full" | "user";
  userId?: string;
  tableCounts: Record<string, number>;
}

export interface ExportBundle {
  metadata: ExportMetadata;
  data: {
    users: any[];
    rewardsCatalog: any[];
    tasks: any[];
    wallets: any[];
    coinTransactions: any[];
    userBadges: any[];
    userRewards: any[];
    taskPatterns: any[];
    taskCollaborators: any[];
    classificationContributions: any[];
    classificationConfirmations: any[];
    passwordResetTokens: any[];
    securityLogs: any[];
  };
}

const CHUNK_SIZE = 1000;

async function queryChunked<T>(table: any, condition?: any): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;

  while (true) {
    const baseQuery = condition
      ? db.select().from(table).where(condition)
      : db.select().from(table);
    const chunk = await baseQuery.limit(CHUNK_SIZE).offset(offset) as T[];
    results.push(...chunk);
    if (chunk.length < CHUNK_SIZE) break;
    offset += CHUNK_SIZE;
  }

  return results;
}

function serializeRow(row: any): any {
  const out: any = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

function serializeRows(rows: any[]): any[] {
  return rows.map(serializeRow);
}

export async function exportFullDatabase(): Promise<ExportBundle> {
  const [
    usersData,
    rewardsCatalogData,
    tasksData,
    walletsData,
    coinTransactionsData,
    userBadgesData,
    userRewardsData,
    taskPatternsData,
    taskCollaboratorsData,
    classContribData,
    classConfirmData,
    resetTokensData,
    securityLogsData,
  ] = await Promise.all([
    queryChunked(users),
    queryChunked(rewardsCatalog),
    queryChunked(tasks),
    queryChunked(wallets),
    queryChunked(coinTransactions),
    queryChunked(userBadges),
    queryChunked(userRewards),
    queryChunked(taskPatterns),
    queryChunked(taskCollaborators),
    queryChunked(classificationContributions),
    queryChunked(classificationConfirmations),
    queryChunked(passwordResetTokens),
    queryChunked(securityLogs),
  ]);

  const data = {
    users: serializeRows(usersData),
    rewardsCatalog: serializeRows(rewardsCatalogData),
    tasks: serializeRows(tasksData),
    wallets: serializeRows(walletsData),
    coinTransactions: serializeRows(coinTransactionsData),
    userBadges: serializeRows(userBadgesData),
    userRewards: serializeRows(userRewardsData),
    taskPatterns: serializeRows(taskPatternsData),
    taskCollaborators: serializeRows(taskCollaboratorsData),
    classificationContributions: serializeRows(classContribData),
    classificationConfirmations: serializeRows(classConfirmData),
    passwordResetTokens: serializeRows(resetTokensData),
    securityLogs: serializeRows(securityLogsData),
  };

  const tableCounts: Record<string, number> = {};
  for (const [key, rows] of Object.entries(data)) {
    tableCounts[key] = rows.length;
  }

  return {
    metadata: {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      exportMode: "full",
      tableCounts,
    },
    data,
  };
}

export async function exportUserData(userId: string): Promise<ExportBundle> {
  const [userData] = await db.select().from(users).where(eq(users.id, userId));
  if (!userData) {
    throw new Error(`User ${userId} not found`);
  }

  const userTasks = await queryChunked(tasks, eq(tasks.userId, userId));
  const taskIds = userTasks.map((t: any) => t.id);

  const [
    walletData,
    coinTxData,
    badgeData,
    rewardCatalog,
    userRewardData,
    patternData,
  ] = await Promise.all([
    queryChunked(wallets, eq(wallets.userId, userId)),
    queryChunked(coinTransactions, eq(coinTransactions.userId, userId)),
    queryChunked(userBadges, eq(userBadges.userId, userId)),
    queryChunked(rewardsCatalog),
    queryChunked(userRewards, eq(userRewards.userId, userId)),
    queryChunked(taskPatterns, eq(taskPatterns.userId, userId)),
  ]);

  const taskIdSet = new Set(taskIds);

  const allCollabs = await queryChunked(taskCollaborators);
  const collabData = (allCollabs as any[]).filter((c: any) => taskIdSet.has(c.taskId));

  const allContribs = await queryChunked(classificationContributions);
  const contribData = (allContribs as any[]).filter((c: any) => taskIdSet.has(c.taskId));

  const contribIdSet = new Set(contribData.map((c: any) => c.id));
  const allConfirms = await queryChunked(classificationConfirmations);
  const confirmData = (allConfirms as any[]).filter((c: any) =>
    taskIdSet.has(c.taskId) && contribIdSet.has(c.contributionId)
  );

  const resetTokens = await queryChunked(passwordResetTokens, eq(passwordResetTokens.userId, userId));
  const userSecLogs = await queryChunked(securityLogs, eq(securityLogs.userId, userId));

  const rewardIdsNeeded = new Set((userRewardData as any[]).map((r: any) => r.rewardId));
  const filteredCatalog = (rewardCatalog as any[]).filter((r: any) => rewardIdsNeeded.has(r.id));

  const data = {
    users: serializeRows([userData]),
    rewardsCatalog: serializeRows(filteredCatalog),
    tasks: serializeRows(userTasks),
    wallets: serializeRows(walletData),
    coinTransactions: serializeRows(coinTxData),
    userBadges: serializeRows(badgeData),
    userRewards: serializeRows(userRewardData),
    taskPatterns: serializeRows(patternData),
    taskCollaborators: serializeRows(collabData),
    classificationContributions: serializeRows(contribData),
    classificationConfirmations: serializeRows(confirmData),
    passwordResetTokens: serializeRows(resetTokens),
    securityLogs: serializeRows(userSecLogs),
  };

  const tableCounts: Record<string, number> = {};
  for (const [key, rows] of Object.entries(data)) {
    tableCounts[key] = rows.length;
  }

  return {
    metadata: {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      exportMode: "user",
      userId,
      tableCounts,
    },
    data,
  };
}
