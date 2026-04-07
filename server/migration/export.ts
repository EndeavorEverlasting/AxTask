import { db } from "../db";
import {
  users, tasks,
  wallets, coinTransactions, userBadges, rewardsCatalog,
  userRewards, taskCollaborators, taskPatterns,
  classificationContributions, classificationConfirmations,
  userBillingProfiles, userClassificationCategories,
  passwordResetTokens, securityLogs,
  appeals, appealVotes, userMilestoneGrants, userEntourage, avatarProfiles, avatarXpEvents,
  userNotificationPreferences, userPushSubscriptions,
  billingPaymentMethods, invoices, invoiceEvents,
  attachmentAssets, taskImportFingerprints,
  premiumSubscriptions, premiumSavedViews, premiumReviewWorkflows, premiumInsights, premiumEvents,
  offlineGenerators, offlineSkillNodes, userOfflineSkills,
  usageSnapshots, storagePolicies,
} from "@shared/schema";
import { and, asc, eq, getTableColumns, gt, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

export interface ExportMetadata {
  schemaVersion: number;
  exportedAt: string;
  exportMode: "full" | "user";
  /** True when exported via admin path with full billing/sensitive user fields. */
  includesPrivilegedUserData?: boolean;
  sourceEnvironment: string;
  userId?: string;
  tableCounts: Record<string, number>;
}

export interface ExportBundle {
  metadata: ExportMetadata;
  data: Record<string, Record<string, unknown>[]>;
}

const CHUNK_SIZE = 1000;

function idOrderColumn(table: PgTable, orderColumn?: AnyPgColumn): AnyPgColumn {
  if (orderColumn) return orderColumn;
  const t = table as unknown as { id?: AnyPgColumn; userId?: AnyPgColumn };
  if (t.id) return t.id;
  if (t.userId) return t.userId;
  throw new Error("queryChunked: pass orderColumn or use a table with id or userId for stable pagination");
}

/** Keyset pagination so live inserts/deletes do not shift offsets between pages. */
async function* queryChunkedStream(
  table: PgTable,
  condition?: SQL,
  orderColumn?: AnyPgColumn,
): AsyncGenerator<Record<string, unknown>[], void, undefined> {
  const idCol = idOrderColumn(table, orderColumn);
  const cols = getTableColumns(table);
  let lastSeen: unknown | undefined = undefined;

  while (true) {
    const cursorCond = lastSeen === undefined ? undefined : gt(idCol, lastSeen as never);
    const whereClause =
      condition && cursorCond ? and(condition, cursorCond) : condition ?? cursorCond;
    const baseQuery = whereClause
      ? db
          .select({ ...cols, _paginationCursor: idCol })
          .from(table)
          .where(whereClause)
          .orderBy(asc(idCol))
          .limit(CHUNK_SIZE)
      : db.select({ ...cols, _paginationCursor: idCol }).from(table).orderBy(asc(idCol)).limit(CHUNK_SIZE);
    const rawRows = (await baseQuery) as Record<string, unknown>[];
    const rows = rawRows.map(({ _paginationCursor: _pc, ...rest }) => rest);
    yield rows;
    if (rawRows.length < CHUNK_SIZE) break;
    const lastVal = rawRows[rawRows.length - 1]._paginationCursor;
    if (lastVal === undefined || lastVal === null) break;
    lastSeen = lastVal;
  }
}

async function queryChunked(
  table: PgTable,
  condition?: SQL,
  orderColumn?: AnyPgColumn,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  for await (const rows of queryChunkedStream(table, condition, orderColumn)) {
    results.push(...rows);
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

function mergeByPrimaryKey(
  primary: Record<string, unknown>[],
  extra: Record<string, unknown>[],
  pkField: string,
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const r of primary) map.set(String(r[pkField]), r);
  for (const r of extra) {
    const k = String(r[pkField]);
    if (!map.has(k)) map.set(k, r);
  }
  return [...map.values()];
}

export async function exportFullDatabase(): Promise<ExportBundle> {
  const [
    usersData,
    userBillingProfilesData,
    userClassificationCategoriesData,
    rewardsCatalogData,
    userNotificationPreferencesData,
    userPushSubscriptionsData,
    billingPaymentMethodsData,
    invoicesData,
    invoiceEventsData,
    appealsData,
    appealVotesData,
    userMilestoneGrantsData,
    userEntourageData,
    avatarProfilesData,
    avatarXpEventsData,
    offlineSkillNodesData,
    offlineGeneratorsData,
    userOfflineSkillsData,
    usageSnapshotsData,
    storagePoliciesData,
    premiumSubscriptionsData,
    premiumSavedViewsData,
    premiumReviewWorkflowsData,
    premiumInsightsData,
    premiumEventsData,
    tasksData,
    attachmentAssetsData,
    taskImportFingerprintsData,
    walletsData,
    coinTransactionsData,
    userBadgesData,
    userRewardsData,
    taskPatternsData,
    taskCollaboratorsData,
    classContribData,
    classConfirmData,
    passwordResetTokensData,
    securityLogsData,
  ] = await Promise.all([
    queryChunked(users),
    queryChunked(userBillingProfiles),
    queryChunked(userClassificationCategories),
    queryChunked(rewardsCatalog),
    queryChunked(userNotificationPreferences),
    queryChunked(userPushSubscriptions),
    queryChunked(billingPaymentMethods),
    queryChunked(invoices),
    queryChunked(invoiceEvents),
    queryChunked(appeals),
    queryChunked(appealVotes),
    queryChunked(userMilestoneGrants),
    queryChunked(userEntourage),
    queryChunked(avatarProfiles),
    queryChunked(avatarXpEvents),
    queryChunked(offlineSkillNodes),
    queryChunked(offlineGenerators),
    queryChunked(userOfflineSkills),
    queryChunked(usageSnapshots),
    queryChunked(storagePolicies),
    queryChunked(premiumSubscriptions),
    queryChunked(premiumSavedViews),
    queryChunked(premiumReviewWorkflows),
    queryChunked(premiumInsights),
    queryChunked(premiumEvents),
    queryChunked(tasks),
    queryChunked(attachmentAssets),
    queryChunked(taskImportFingerprints),
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
    userNotificationPreferences: serializeRows(userNotificationPreferencesData),
    userPushSubscriptions: serializeRows(userPushSubscriptionsData),
    billingPaymentMethods: serializeRows(billingPaymentMethodsData),
    invoices: serializeRows(invoicesData),
    invoiceEvents: serializeRows(invoiceEventsData),
    appeals: serializeRows(appealsData),
    appealVotes: serializeRows(appealVotesData),
    userMilestoneGrants: serializeRows(userMilestoneGrantsData),
    userEntourage: serializeRows(userEntourageData),
    avatarProfiles: serializeRows(avatarProfilesData),
    avatarXpEvents: serializeRows(avatarXpEventsData),
    offlineSkillNodes: serializeRows(offlineSkillNodesData),
    offlineGenerators: serializeRows(offlineGeneratorsData),
    userOfflineSkills: serializeRows(userOfflineSkillsData),
    usageSnapshots: serializeRows(usageSnapshotsData),
    storagePolicies: serializeRows(storagePoliciesData),
    premiumSubscriptions: serializeRows(premiumSubscriptionsData),
    premiumSavedViews: serializeRows(premiumSavedViewsData),
    premiumReviewWorkflows: serializeRows(premiumReviewWorkflowsData),
    premiumInsights: serializeRows(premiumInsightsData),
    premiumEvents: serializeRows(premiumEventsData),
    tasks: serializeRows(tasksData),
    attachmentAssets: serializeRows(attachmentAssetsData),
    taskImportFingerprints: serializeRows(taskImportFingerprintsData),
    wallets: serializeRows(walletsData),
    coinTransactions: serializeRows(coinTransactionsData),
    userBadges: serializeRows(userBadgesData),
    userRewards: serializeRows(userRewardsData),
    taskPatterns: serializeRows(taskPatternsData),
    taskCollaborators: serializeRows(taskCollaboratorsData),
    classificationContributions: serializeRows(classContribData),
    classificationConfirmations: serializeRows(classConfirmData),
    passwordResetTokens: serializeRows(passwordResetTokensData),
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
  "email",
  "displayName",
  "profileImageUrl",
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

  const userTasks = await queryChunked(tasks, eq(tasks.userId, userId), tasks.id);
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
    queryChunked(wallets, eq(wallets.userId, userId), wallets.userId),
    queryChunked(coinTransactions, eq(coinTransactions.userId, userId), coinTransactions.id),
    queryChunked(userBadges, eq(userBadges.userId, userId), userBadges.id),
    queryChunked(rewardsCatalog, undefined, rewardsCatalog.id),
    queryChunked(userRewards, eq(userRewards.userId, userId), userRewards.id),
    queryChunked(taskPatterns, eq(taskPatterns.userId, userId), taskPatterns.id),
    queryChunked(userBillingProfiles, eq(userBillingProfiles.userId, userId), userBillingProfiles.userId),
    queryChunked(userClassificationCategories, eq(userClassificationCategories.userId, userId), userClassificationCategories.id),
  ]);

  const ownedTaskIdSet = new Set(taskIds);

  let collabData = await queryChunked(taskCollaborators, eq(taskCollaborators.userId, userId), taskCollaborators.id);
  let contribData = await queryChunked(
    classificationContributions,
    eq(classificationContributions.userId, userId),
    classificationContributions.id,
  );
  let confirmData = await queryChunked(
    classificationConfirmations,
    eq(classificationConfirmations.userId, userId),
    classificationConfirmations.id,
  );

  if (ownedTaskIdSet.size > 0) {
    const idArr = Array.from(ownedTaskIdSet);
    const CHUNK = 2000;
    let extraCollab: Record<string, unknown>[] = [];
    let extraContrib: Record<string, unknown>[] = [];
    let extraConfirm: Record<string, unknown>[] = [];
    for (let i = 0; i < idArr.length; i += CHUNK) {
      const chunk = idArr.slice(i, i + CHUNK);
      extraCollab.push(
        ...(await queryChunked(
          taskCollaborators,
          inArray(taskCollaborators.taskId, chunk),
          taskCollaborators.id,
        )),
      );
      extraContrib.push(
        ...(await queryChunked(
          classificationContributions,
          inArray(classificationContributions.taskId, chunk),
          classificationContributions.id,
        )),
      );
      extraConfirm.push(
        ...(await queryChunked(
          classificationConfirmations,
          inArray(classificationConfirmations.taskId, chunk),
          classificationConfirmations.id,
        )),
      );
    }
    collabData = mergeByPrimaryKey(collabData, extraCollab, "id");
    contribData = mergeByPrimaryKey(contribData, extraContrib, "id");
    confirmData = mergeByPrimaryKey(confirmData, extraConfirm, "id");
  }

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
      for await (const rows of queryChunkedStream(tasks, inArray(tasks.id, chunk), tasks.id)) {
        referencedTasks.push(...rows);
      }
    }
  }

  const allTaskRows = [...userTasks, ...referencedTasks];

  const rewardIdsNeeded = new Set(userRewardData.map((r) => r.rewardId as string));
  const filteredCatalog = rewardCatalog.filter((r) => rewardIdsNeeded.has(r.id as string));

  // User export intentionally omits tables present in `exportFullDatabase`: cross-user or infra rows
  // (e.g. userNotificationPreferences, userPushSubscriptions, billingPaymentMethods, invoices, invoiceEvents,
  // appeals, appealVotes, userMilestoneGrants, userEntourage, avatarProfiles, avatarXpEvents, offlineSkillNodes,
  // offlineGenerators, userOfflineSkills, usageSnapshots, storagePolicies, premiumSubscriptions, premiumSavedViews,
  // premiumReviewWorkflows, premiumInsights, premiumEvents, attachmentAssets, taskImportFingerprints) and empty
  // stubs here (passwordResetTokens, securityLogs). Keeps the bundle focused on one user's tasks + gamification core.

  const data: Record<string, Record<string, unknown>[]> = {
    users: serializeRows([adminMode ? (userData as Record<string, unknown>) : sanitizeUserRow(userData as Record<string, unknown>)]),
    userBillingProfiles: adminMode ? serializeRows(billingProfileData) : [],
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
      includesPrivilegedUserData: adminMode,
      sourceEnvironment: process.env.REPL_SLUG || process.env.REPLIT_DEV_DOMAIN || "unknown",
      userId,
      tableCounts,
    },
    data,
  };
}
