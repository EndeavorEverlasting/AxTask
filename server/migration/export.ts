import { db } from "../db";
import {
  users, tasks, passwordResetTokens, securityLogs,
  wallets, coinTransactions, userBadges, rewardsCatalog,
  userRewards, taskCollaborators, taskPatterns,
  classificationContributions, classificationConfirmations,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { createHmac } from "crypto";

const BUNDLE_SIGNING_KEY = process.env.SESSION_SECRET || process.env.REPL_ID || "axtask-migration-key";

export function signBundle(bundle: ExportBundle): string {
  const payload = JSON.stringify(bundle.data) + bundle.metadata.exportedAt;
  return createHmac("sha256", BUNDLE_SIGNING_KEY).update(payload).digest("hex");
}

export function verifyBundleSignature(bundle: ExportBundle, signature: string): boolean {
  const expected = signBundle(bundle);
  return expected === signature;
}

export interface ExportMetadata {
  schemaVersion: number;
  exportedAt: string;
  exportMode: "full" | "user";
  sourceEnvironment: string;
  signature?: string;
  userId?: string;
  tableCounts: Record<string, number>;
}

export interface ExportBundle {
  metadata: ExportMetadata;
  data: Record<string, Record<string, unknown>[]>;
}

const CHUNK_SIZE = 1000;

async function queryChunked(table: Parameters<typeof db.select>[0] extends undefined ? typeof users : never, condition?: Parameters<typeof db.select>[0] extends undefined ? unknown : never): Promise<Record<string, unknown>[]>;
async function queryChunked(table: unknown, condition?: unknown): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const tbl = table as typeof users;
    const baseQuery = condition
      ? db.select().from(tbl).where(condition as ReturnType<typeof eq>)
      : db.select().from(tbl);
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

  const data: Record<string, Record<string, unknown>[]> = {
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
      sourceEnvironment: process.env.REPL_SLUG || process.env.REPLIT_DEV_DOMAIN || "unknown",
      tableCounts,
    },
    data,
  };
}

const SENSITIVE_USER_FIELDS = new Set([
  "passwordHash", "securityAnswerHash", "securityQuestion",
  "failedLoginAttempts", "lockedUntil",
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
  ] = await Promise.all([
    queryChunked(wallets, eq(wallets.userId, userId)),
    queryChunked(coinTransactions, eq(coinTransactions.userId, userId)),
    queryChunked(userBadges, eq(userBadges.userId, userId)),
    queryChunked(rewardsCatalog),
    queryChunked(userRewards, eq(userRewards.userId, userId)),
    queryChunked(taskPatterns, eq(taskPatterns.userId, userId)),
  ]);

  const ownedTaskIdSet = new Set(taskIds);

  const allCollabs = await queryChunked(taskCollaborators);
  const allContribs = await queryChunked(classificationContributions);
  const allConfirms = await queryChunked(classificationConfirmations);

  const collabData = allCollabs.filter((c) => (c.userId as string) === userId);

  const userContribs = allContribs.filter((c) => (c.userId as string) === userId);

  const userConfirms = allConfirms.filter((c) => (c.userId as string) === userId);

  const exportedContribIds = new Set(userContribs.map((c) => c.id as string));
  const neededContribIds = new Set<string>();
  for (const confirm of userConfirms) {
    const cid = confirm.contributionId as string;
    if (cid && !exportedContribIds.has(cid)) {
      neededContribIds.add(cid);
    }
  }

  const referencedContribs = neededContribIds.size > 0
    ? allContribs.filter((c) => neededContribIds.has(c.id as string))
    : [];
  const allExportedContribs = [...userContribs, ...referencedContribs];

  const rewardIdsNeeded = new Set(userRewardData.map((r) => r.rewardId as string));
  const filteredCatalog = rewardCatalog.filter((r) => rewardIdsNeeded.has(r.id as string));

  const data: Record<string, Record<string, unknown>[]> = {
    users: serializeRows([adminMode ? (userData as Record<string, unknown>) : sanitizeUserRow(userData as Record<string, unknown>)]),
    rewardsCatalog: serializeRows(filteredCatalog),
    tasks: serializeRows(userTasks),
    wallets: serializeRows(walletData),
    coinTransactions: serializeRows(coinTxData),
    userBadges: serializeRows(badgeData),
    userRewards: serializeRows(userRewardData),
    taskPatterns: serializeRows(patternData),
    taskCollaborators: serializeRows(collabData),
    classificationContributions: serializeRows(allExportedContribs),
    classificationConfirmations: serializeRows(userConfirms),
    passwordResetTokens: [],
    securityLogs: [],
  };

  const tableCounts: Record<string, number> = {};
  for (const [key, rows] of Object.entries(data)) {
    tableCounts[key] = rows.length;
  }

  const bundle: ExportBundle = {
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
  bundle.metadata.signature = signBundle(bundle);
  return bundle;
}
