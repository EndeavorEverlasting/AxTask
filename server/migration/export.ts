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
import { and, asc, eq, getTableColumns, gt, inArray, isNull, sql, type SQL } from "drizzle-orm";
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

type ExportQueryDb = Pick<typeof db, "select">;

/** Keyset pagination so live inserts/deletes do not shift offsets between pages. */
async function* queryChunkedStream(
  executor: ExportQueryDb,
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
      ? executor
          .select({ ...cols, _paginationCursor: idCol })
          .from(table)
          .where(whereClause)
          .orderBy(asc(idCol))
          .limit(CHUNK_SIZE)
      : executor.select({ ...cols, _paginationCursor: idCol }).from(table).orderBy(asc(idCol)).limit(CHUNK_SIZE);
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
  executor: ExportQueryDb,
  table: PgTable,
  condition?: SQL,
  orderColumn?: AnyPgColumn,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  for await (const rows of queryChunkedStream(executor, table, condition, orderColumn)) {
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

export type ExportFullDatabaseOptions = {
  /** When true, include password reset tokens (active only) and security logs. Default false. */
  includeSecurityTables?: boolean;
};

async function exportFullDatabaseSnapshot(tx: ExportQueryDb, opts?: ExportFullDatabaseOptions): Promise<ExportBundle> {
  const includeSecurityTables = opts?.includeSecurityTables === true;
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
  ] = await Promise.all([
    queryChunked(tx, users),
    queryChunked(tx, userBillingProfiles),
    queryChunked(tx, userClassificationCategories),
    queryChunked(tx, rewardsCatalog),
    queryChunked(tx, userNotificationPreferences),
    queryChunked(tx, userPushSubscriptions),
    queryChunked(tx, billingPaymentMethods),
    queryChunked(tx, invoices),
    queryChunked(tx, invoiceEvents),
    queryChunked(tx, appeals),
    queryChunked(tx, appealVotes),
    queryChunked(tx, userMilestoneGrants),
    queryChunked(tx, userEntourage),
    queryChunked(tx, avatarProfiles),
    queryChunked(tx, avatarXpEvents),
    queryChunked(tx, offlineSkillNodes),
    queryChunked(tx, offlineGenerators),
    queryChunked(tx, userOfflineSkills),
    queryChunked(tx, usageSnapshots),
    queryChunked(tx, storagePolicies),
    queryChunked(tx, premiumSubscriptions),
    queryChunked(tx, premiumSavedViews),
    queryChunked(tx, premiumReviewWorkflows),
    queryChunked(tx, premiumInsights),
    queryChunked(tx, premiumEvents),
    queryChunked(tx, tasks),
    queryChunked(tx, attachmentAssets),
    queryChunked(tx, taskImportFingerprints),
    queryChunked(tx, wallets),
    queryChunked(tx, coinTransactions),
    queryChunked(tx, userBadges),
    queryChunked(tx, userRewards),
    queryChunked(tx, taskPatterns),
    queryChunked(tx, taskCollaborators),
    queryChunked(tx, classificationContributions),
    queryChunked(tx, classificationConfirmations),
  ]);

  let passwordResetTokensData: Record<string, unknown>[] = [];
  let securityLogsData: Record<string, unknown>[] = [];
  if (includeSecurityTables) {
    const now = new Date();
    [passwordResetTokensData, securityLogsData] = await Promise.all([
      queryChunked(
        tx,
        passwordResetTokens,
        and(isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, now)),
      ),
      queryChunked(tx, securityLogs),
    ]);
  }

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
  };
  if (includeSecurityTables) {
    data.passwordResetTokens = serializeRows(passwordResetTokensData);
    data.securityLogs = serializeRows(securityLogsData);
  }

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

export async function exportFullDatabase(opts?: ExportFullDatabaseOptions): Promise<ExportBundle> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"));
    return exportFullDatabaseSnapshot(tx as unknown as ExportQueryDb, opts);
  });
}

const ALWAYS_REDACT_USER_FIELDS = new Set([
  "passwordHash",
  "securityAnswerHash",
  "securityQuestion",
  "failedLoginAttempts",
  "lockedUntil",
  "banReason",
  "bannedAt",
  "bannedBy",
]);

const CROSS_USER_PII_FIELDS = new Set([
  "workosId",
  "googleId",
  "replitId",
  "phoneE164",
  "phoneVerifiedAt",
  "birthDate",
  "email",
  "displayName",
  "profileImageUrl",
]);

function sanitizeUserRowForExport(
  row: Record<string, unknown>,
  requesterId: string | null,
  adminMode: boolean,
): Record<string, unknown> {
  if (adminMode) return { ...row };
  const isOwner = requesterId != null && String(row.id) === String(requesterId);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (ALWAYS_REDACT_USER_FIELDS.has(key)) continue;
    if (!isOwner && CROSS_USER_PII_FIELDS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export async function exportUserData(userId: string, options: { adminMode?: boolean } = {}): Promise<ExportBundle> {
  const { adminMode = false } = options;
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"));
    const ex = tx as unknown as ExportQueryDb;

    const [userData] = await tx.select().from(users).where(eq(users.id, userId));
    if (!userData) {
      throw new Error(`User ${userId} not found`);
    }

    const userTasks = await queryChunked(ex, tasks, eq(tasks.userId, userId), tasks.id);
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
      queryChunked(ex, wallets, eq(wallets.userId, userId), wallets.userId),
      queryChunked(ex, coinTransactions, eq(coinTransactions.userId, userId), coinTransactions.id),
      queryChunked(ex, userBadges, eq(userBadges.userId, userId), userBadges.id),
      queryChunked(ex, rewardsCatalog, undefined, rewardsCatalog.id),
      queryChunked(ex, userRewards, eq(userRewards.userId, userId), userRewards.id),
      queryChunked(ex, taskPatterns, eq(taskPatterns.userId, userId), taskPatterns.id),
      queryChunked(ex, userBillingProfiles, eq(userBillingProfiles.userId, userId), userBillingProfiles.userId),
      queryChunked(
        ex,
        userClassificationCategories,
        eq(userClassificationCategories.userId, userId),
        userClassificationCategories.id,
      ),
    ]);

    const ownedTaskIdSet = new Set(taskIds);

    let collabData = await queryChunked(ex, taskCollaborators, eq(taskCollaborators.userId, userId), taskCollaborators.id);
    let contribData = await queryChunked(
      ex,
      classificationContributions,
      eq(classificationContributions.userId, userId),
      classificationContributions.id,
    );
    let confirmData = await queryChunked(
      ex,
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
            ex,
            taskCollaborators,
            inArray(taskCollaborators.taskId, chunk),
            taskCollaborators.id,
          )),
        );
        extraContrib.push(
          ...(await queryChunked(
            ex,
            classificationContributions,
            inArray(classificationContributions.taskId, chunk),
            classificationContributions.id,
          )),
        );
        extraConfirm.push(
          ...(await queryChunked(
            ex,
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
        for await (const rows of queryChunkedStream(ex, tasks, inArray(tasks.id, chunk), tasks.id)) {
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
      users: serializeRows([
        sanitizeUserRowForExport(userData as Record<string, unknown>, userId, adminMode),
      ]),
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
  });
}
