import { db } from "../db";
import {
  users, tasks, passwordResetTokens, securityLogs,
  wallets, coinTransactions, userBadges, rewardsCatalog,
  userRewards, taskCollaborators, taskPatterns,
  classificationContributions, classificationConfirmations,
  userBillingProfiles, userClassificationCategories,
} from "@shared/schema";
import { asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

export interface ExportMetadata {
  schemaVersion: number;
  exportedAt: string;
  exportMode: "full" | "user";
  sourceEnvironment: string;
  userId?: string;
  tableCounts: Record<string, number>;
}

export interface ExportBundle {
  metadata: ExportMetadata;
  data: Record<string, Record<string, unknown>[]>;
}

const CHUNK_SIZE = 1000;

function idOrderColumn(table: PgTable): AnyPgColumn {
  const t = table as unknown as { id?: AnyPgColumn };
  if (!t.id) throw new Error("queryChunked: table must expose an id column for stable pagination");
  return t.id;
}

async function queryChunked(table: PgTable, condition?: SQL): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let offset = 0;
  const idCol = idOrderColumn(table);

  while (true) {
    const baseQuery = condition
      ? db.select().from(table).where(condition).orderBy(asc(idCol))
      : db.select().from(table).orderBy(asc(idCol));
    const chunk = await baseQuery.limit(CHUNK_SIZE).offset(offset);
    results.push(...(chunk as Record<string, unknown>[]));
    if (chunk.length < CHUNK_SIZE) break;
    offset += CHUNK_SIZE;
  }

  return results;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(serializeRow);
}

export async function exportFullDatabase(): Promise<ExportBundle> {
  const [
    usersData,
    userBillingProfilesData,
    userClassificationCategoriesData,
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
    queryChunked(userBillingProfiles),
    queryChunked(userClassificationCategories),
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

  const data: Record<string, Record<string, unknown>[]> = {
    users: serializeRows(usersData),
    userBillingProfiles: serializeRows(userBillingProfilesData),
    userClassificationCategories: serializeRows(userClassificationCategoriesData),
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
      sourceEnvironment: process.env.REPL_SLUG || process.env.REPLIT_DEV_DOMAIN || "unknown",
      tableCounts,
    },
    data,
  };
}

const SENSITIVE_USER_FIELDS = new Set([
  "passwordHash",
  "securityAnswerHash",
  "securityQuestion",
  "failedLoginAttempts",
  "lockedUntil",
  "workosId",
  "googleId",
  "replitId",
  "phoneE164",
  "phoneVerifiedAt",
  "birthDate",
  "banReason",
  "bannedAt",
  "bannedBy",
]);

function sanitizeUserRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!SENSITIVE_USER_FIELDS.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

export async function exportUserData(userId: string, options: { adminMode?: boolean } = {}): Promise<ExportBundle> {
  const { adminMode = false } = options;
  const [userData] = await db.select().from(users).where(eq(users.id, userId));
  if (!userData) {
    throw new Error(`User ${userId} not found`);
  }

  const userTasks = await queryChunked(tasks, eq(tasks.userId, userId));
  const taskIds = userTasks.map((t) => t.id as string);

  const [
    walletData,
    coinTxData,
    badgeData,
    rewardCatalog,
    userRewardData,
    patternData,
    billingProfileData,
    classCatData,
  ] = await Promise.all([
    queryChunked(wallets, eq(wallets.userId, userId)),
    queryChunked(coinTransactions, eq(coinTransactions.userId, userId)),
    queryChunked(userBadges, eq(userBadges.userId, userId)),
    queryChunked(rewardsCatalog),
    queryChunked(userRewards, eq(userRewards.userId, userId)),
    queryChunked(taskPatterns, eq(taskPatterns.userId, userId)),
    queryChunked(userBillingProfiles, eq(userBillingProfiles.userId, userId)),
    queryChunked(userClassificationCategories, eq(userClassificationCategories.userId, userId)),
  ]);

  const ownedTaskIdSet = new Set(taskIds);

  const collabData = await queryChunked(taskCollaborators, eq(taskCollaborators.userId, userId));
  const contribData = await queryChunked(classificationContributions, eq(classificationContributions.userId, userId));
  const confirmData = await queryChunked(classificationConfirmations, eq(classificationConfirmations.userId, userId));

  const referencedTaskIds = new Set<string>();
  for (const c of collabData) {
    const tid = c.taskId as string;
    if (tid && !ownedTaskIdSet.has(tid)) referencedTaskIds.add(tid);
  }
  for (const c of contribData) {
    const tid = c.taskId as string;
    if (tid && !ownedTaskIdSet.has(tid)) referencedTaskIds.add(tid);
  }
  for (const c of confirmData) {
    const tid = c.taskId as string;
    if (tid && !ownedTaskIdSet.has(tid)) referencedTaskIds.add(tid);
  }

  let referencedTasks: Record<string, unknown>[] = [];
  if (referencedTaskIds.size > 0) {
    const idList = Array.from(referencedTaskIds);
    const CHUNK = 5000;
    for (let i = 0; i < idList.length; i += CHUNK) {
      const chunk = idList.slice(i, i + CHUNK);
      const part = (await queryChunked(tasks, inArray(tasks.id, chunk))) as Record<string, unknown>[];
      referencedTasks.push(...part);
    }
  }

  const allTaskRows = [...userTasks, ...referencedTasks];

  const rewardIdsNeeded = new Set(userRewardData.map((r) => r.rewardId as string));
  const filteredCatalog = rewardCatalog.filter((r) => rewardIdsNeeded.has(r.id as string));

  const data: Record<string, Record<string, unknown>[]> = {
    users: serializeRows([adminMode ? (userData as Record<string, unknown>) : sanitizeUserRow(userData as Record<string, unknown>)]),
    userBillingProfiles: serializeRows(billingProfileData),
    userClassificationCategories: serializeRows(classCatData),
    rewardsCatalog: serializeRows(filteredCatalog),
    tasks: serializeRows(allTaskRows),
    wallets: serializeRows(walletData),
    coinTransactions: serializeRows(coinTxData),
    userBadges: serializeRows(badgeData),
    userRewards: serializeRows(userRewardData),
    taskPatterns: serializeRows(patternData),
    taskCollaborators: serializeRows(collabData),
    classificationContributions: serializeRows(contribData),
    classificationConfirmations: serializeRows(confirmData),
    passwordResetTokens: [],
    securityLogs: [],
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
      sourceEnvironment: process.env.REPL_SLUG || process.env.REPLIT_DEV_DOMAIN || "unknown",
      userId,
      tableCounts,
    },
    data,
  };
}
