import { db } from "../db";
import { randomUUID } from "crypto";
import {
  users, tasks, passwordResetTokens, securityLogs,
  wallets, coinTransactions, userBadges, rewardsCatalog,
  userRewards, taskCollaborators, taskPatterns,
  classificationContributions, classificationConfirmations,
  userBillingProfiles, userClassificationCategories,
  appeals, appealVotes, userMilestoneGrants, userEntourage, avatarProfiles, avatarXpEvents,
  userNotificationPreferences, userPushSubscriptions,
  billingPaymentMethods, invoices, invoiceEvents,
  attachmentAssets, taskImportFingerprints,
  premiumSubscriptions, premiumSavedViews, premiumReviewWorkflows, premiumInsights, premiumEvents,
  offlineGenerators, offlineSkillNodes, userOfflineSkills,
  usageSnapshots, storagePolicies,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ExportBundle } from "./export";
import { insertBundleTaskWithFingerprintClaimTx, reconcileBundleTaskIdMapForTasks } from "../import-task-dedupe";

type AnyPgTable = PgTable;
type AnyPgColumn = typeof users.id;

export interface ValidationIssue {
  table: string;
  rowIndex: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ImportResult {
  success: boolean;
  dryRun: boolean;
  mode: "preserve" | "remap";
  inserted: Record<string, number>;
  skipped: Record<string, number>;
  conflicts: Record<string, number>;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

type BundleRow = Record<string, unknown>;

const TABLE_INSERT_ORDER = [
  "users",
  "userBillingProfiles",
  "userClassificationCategories",
  "rewardsCatalog",
  "userNotificationPreferences",
  "userPushSubscriptions",
  "billingPaymentMethods",
  "invoices",
  "invoiceEvents",
  "appeals",
  "appealVotes",
  "userMilestoneGrants",
  "userEntourage",
  "avatarProfiles",
  "avatarXpEvents",
  "offlineSkillNodes",
  "offlineGenerators",
  "userOfflineSkills",
  "usageSnapshots",
  "storagePolicies",
  "premiumSubscriptions",
  "premiumSavedViews",
  "premiumReviewWorkflows",
  "premiumInsights",
  "premiumEvents",
  "tasks",
  "attachmentAssets",
  "taskImportFingerprints",
  "wallets",
  "coinTransactions",
  "userBadges",
  "userRewards",
  "taskPatterns",
  "taskCollaborators",
  "classificationContributions",
  "classificationConfirmations",
  "passwordResetTokens",
  "securityLogs",
] as const;

type TableName = typeof TABLE_INSERT_ORDER[number];

type DrizzleTable =
  | typeof users
  | typeof userBillingProfiles
  | typeof userClassificationCategories
  | typeof rewardsCatalog
  | typeof userNotificationPreferences
  | typeof userPushSubscriptions
  | typeof billingPaymentMethods
  | typeof invoices
  | typeof invoiceEvents
  | typeof appeals
  | typeof appealVotes
  | typeof userMilestoneGrants
  | typeof userEntourage
  | typeof avatarProfiles
  | typeof avatarXpEvents
  | typeof offlineSkillNodes
  | typeof offlineGenerators
  | typeof userOfflineSkills
  | typeof usageSnapshots
  | typeof storagePolicies
  | typeof premiumSubscriptions
  | typeof premiumSavedViews
  | typeof premiumReviewWorkflows
  | typeof premiumInsights
  | typeof premiumEvents
  | typeof tasks
  | typeof attachmentAssets
  | typeof taskImportFingerprints
  | typeof wallets
  | typeof coinTransactions
  | typeof userBadges
  | typeof userRewards
  | typeof taskPatterns
  | typeof taskCollaborators
  | typeof classificationContributions
  | typeof classificationConfirmations
  | typeof passwordResetTokens
  | typeof securityLogs;

const TABLE_MAP: Record<TableName, DrizzleTable> = {
  users,
  userBillingProfiles,
  userClassificationCategories,
  rewardsCatalog,
  userNotificationPreferences,
  userPushSubscriptions,
  billingPaymentMethods,
  invoices,
  invoiceEvents,
  appeals,
  appealVotes,
  userMilestoneGrants,
  userEntourage,
  avatarProfiles,
  avatarXpEvents,
  offlineSkillNodes,
  offlineGenerators,
  userOfflineSkills,
  usageSnapshots,
  storagePolicies,
  premiumSubscriptions,
  premiumSavedViews,
  premiumReviewWorkflows,
  premiumInsights,
  premiumEvents,
  tasks,
  attachmentAssets,
  taskImportFingerprints,
  wallets,
  coinTransactions,
  userBadges,
  userRewards,
  taskPatterns,
  taskCollaborators,
  classificationContributions,
  classificationConfirmations,
  passwordResetTokens,
  securityLogs,
};

const PK_FIELD: Record<TableName, string> = {
  users: "id",
  userBillingProfiles: "userId",
  userClassificationCategories: "id",
  rewardsCatalog: "id",
  userNotificationPreferences: "userId",
  userPushSubscriptions: "id",
  billingPaymentMethods: "id",
  invoices: "id",
  invoiceEvents: "id",
  appeals: "id",
  appealVotes: "id",
  userMilestoneGrants: "id",
  userEntourage: "userId",
  avatarProfiles: "id",
  avatarXpEvents: "id",
  offlineSkillNodes: "id",
  offlineGenerators: "userId",
  userOfflineSkills: "id",
  usageSnapshots: "id",
  storagePolicies: "id",
  premiumSubscriptions: "id",
  premiumSavedViews: "id",
  premiumReviewWorkflows: "id",
  premiumInsights: "id",
  premiumEvents: "id",
  tasks: "id",
  attachmentAssets: "id",
  taskImportFingerprints: "id",
  wallets: "userId",
  coinTransactions: "id",
  userBadges: "id",
  userRewards: "id",
  taskPatterns: "id",
  taskCollaborators: "id",
  classificationContributions: "id",
  classificationConfirmations: "id",
  passwordResetTokens: "id",
  securityLogs: "id",
};

interface FkRule {
  field: string;
  refTable: TableName;
  refField: string;
  nullable?: boolean;
  /** Skip on insert; apply after all `users` rows exist (self-FK ordering). */
  deferredSecondPass?: boolean;
}

const FK_RULES: Record<TableName, FkRule[]> = {
  users: [
    {
      field: "bannedBy",
      refTable: "users",
      refField: "id",
      nullable: true,
      deferredSecondPass: true,
    },
  ],
  userBillingProfiles: [{ field: "userId", refTable: "users", refField: "id" }],
  userClassificationCategories: [{ field: "userId", refTable: "users", refField: "id" }],
  rewardsCatalog: [],
  userNotificationPreferences: [{ field: "userId", refTable: "users", refField: "id" }],
  userPushSubscriptions: [{ field: "userId", refTable: "users", refField: "id" }],
  billingPaymentMethods: [{ field: "userId", refTable: "users", refField: "id" }],
  invoices: [{ field: "userId", refTable: "users", refField: "id" }],
  invoiceEvents: [
    { field: "invoiceId", refTable: "invoices", refField: "id" },
    { field: "actorUserId", refTable: "users", refField: "id", nullable: true },
  ],
  appeals: [
    { field: "appellantUserId", refTable: "users", refField: "id" },
    { field: "resolvedByUserId", refTable: "users", refField: "id", nullable: true },
  ],
  appealVotes: [
    { field: "appealId", refTable: "appeals", refField: "id" },
    { field: "adminUserId", refTable: "users", refField: "id" },
  ],
  userMilestoneGrants: [{ field: "userId", refTable: "users", refField: "id" }],
  userEntourage: [{ field: "userId", refTable: "users", refField: "id" }],
  avatarProfiles: [{ field: "userId", refTable: "users", refField: "id" }],
  avatarXpEvents: [{ field: "userId", refTable: "users", refField: "id" }],
  offlineSkillNodes: [],
  offlineGenerators: [{ field: "userId", refTable: "users", refField: "id" }],
  userOfflineSkills: [
    { field: "userId", refTable: "users", refField: "id" },
    { field: "skillNodeId", refTable: "offlineSkillNodes", refField: "id" },
  ],
  usageSnapshots: [],
  storagePolicies: [{ field: "userId", refTable: "users", refField: "id", nullable: true }],
  premiumSubscriptions: [{ field: "userId", refTable: "users", refField: "id" }],
  premiumSavedViews: [{ field: "userId", refTable: "users", refField: "id" }],
  premiumReviewWorkflows: [{ field: "userId", refTable: "users", refField: "id" }],
  premiumInsights: [{ field: "userId", refTable: "users", refField: "id" }],
  premiumEvents: [{ field: "userId", refTable: "users", refField: "id", nullable: true }],
  tasks: [{ field: "userId", refTable: "users", refField: "id" }],
  attachmentAssets: [{ field: "userId", refTable: "users", refField: "id" }],
  taskImportFingerprints: [
    { field: "userId", refTable: "users", refField: "id" },
    { field: "firstTaskId", refTable: "tasks", refField: "id", nullable: true },
  ],
  wallets: [{ field: "userId", refTable: "users", refField: "id" }],
  coinTransactions: [
    { field: "userId", refTable: "users", refField: "id" },
    { field: "taskId", refTable: "tasks", refField: "id", nullable: true },
  ],
  userBadges: [{ field: "userId", refTable: "users", refField: "id" }],
  userRewards: [
    { field: "userId", refTable: "users", refField: "id" },
    { field: "rewardId", refTable: "rewardsCatalog", refField: "id" },
  ],
  taskPatterns: [{ field: "userId", refTable: "users", refField: "id" }],
  taskCollaborators: [
    { field: "taskId", refTable: "tasks", refField: "id" },
    { field: "userId", refTable: "users", refField: "id" },
    { field: "invitedBy", refTable: "users", refField: "id", nullable: true },
  ],
  classificationContributions: [
    { field: "taskId", refTable: "tasks", refField: "id" },
    { field: "userId", refTable: "users", refField: "id" },
  ],
  classificationConfirmations: [
    { field: "contributionId", refTable: "classificationContributions", refField: "id" },
    { field: "taskId", refTable: "tasks", refField: "id" },
    { field: "userId", refTable: "users", refField: "id" },
  ],
  passwordResetTokens: [{ field: "userId", refTable: "users", refField: "id" }],
  securityLogs: [
    { field: "userId", refTable: "users", refField: "id", nullable: true },
    { field: "targetUserId", refTable: "users", refField: "id", nullable: true },
  ],
};

const FK_FIELDS_BY_TABLE: Record<TableName, string[]> = {
  users: ["bannedBy"],
  userBillingProfiles: ["userId"],
  userClassificationCategories: ["userId"],
  rewardsCatalog: [],
  userNotificationPreferences: ["userId"],
  userPushSubscriptions: ["userId"],
  billingPaymentMethods: ["userId"],
  invoices: ["userId"],
  invoiceEvents: ["invoiceId", "actorUserId"],
  appeals: ["appellantUserId", "resolvedByUserId"],
  appealVotes: ["appealId", "adminUserId"],
  userMilestoneGrants: ["userId"],
  userEntourage: ["userId"],
  avatarProfiles: ["userId"],
  avatarXpEvents: ["userId"],
  offlineSkillNodes: [],
  offlineGenerators: ["userId"],
  userOfflineSkills: ["userId", "skillNodeId"],
  usageSnapshots: [],
  storagePolicies: ["userId"],
  premiumSubscriptions: ["userId"],
  premiumSavedViews: ["userId"],
  premiumReviewWorkflows: ["userId"],
  premiumInsights: ["userId"],
  premiumEvents: ["userId"],
  tasks: ["userId"],
  attachmentAssets: ["userId"],
  taskImportFingerprints: ["userId", "firstTaskId"],
  wallets: ["userId"],
  coinTransactions: ["userId", "taskId"],
  userBadges: ["userId"],
  userRewards: ["userId", "rewardId"],
  taskPatterns: ["userId"],
  taskCollaborators: ["taskId", "userId", "invitedBy"],
  classificationContributions: ["taskId", "userId"],
  classificationConfirmations: ["contributionId", "taskId", "userId"],
  passwordResetTokens: ["userId"],
  securityLogs: ["userId", "targetUserId"],
};

/**
 * Tables importable via self-service `importUserBundle` (single-user state only).
 * Must cover tables emitted by `exportUserData` so restores are not silently dropped.
 * The bundle `users` row is remapped to `targetUserId` separately and is not inserted via this set.
 */
const USER_OWNED_TABLES = new Set<string>([
  "tasks",
  "taskPatterns",
  "taskImportFingerprints",
  "attachmentAssets",
  "userBillingProfiles",
  "userClassificationCategories",
  "userEntourage",
  "avatarProfiles",
  "rewardsCatalog",
  "wallets",
  "coinTransactions",
  "userBadges",
  "userRewards",
  "taskCollaborators",
  "classificationContributions",
  "classificationConfirmations",
  "passwordResetTokens",
  "securityLogs",
]);

const TIMESTAMP_FIELDS = [
  "createdAt", "updatedAt", "expiresAt", "usedAt", "bannedAt",
  "lockedUntil", "earnedAt", "redeemedAt", "lastSeen", "invitedAt",
  "phoneVerifiedAt", "startsAt", "endsAt", "graceUntil", "resolvedAt",
  "issuedAt", "paidAt", "consumedAt", "lastSeenAt", "lastSentAt", "computedAt",
];

function maskEmailForImportWarning(email: string): string {
  const s = String(email).trim();
  const i = s.indexOf("@");
  if (i <= 0) return "[redacted]";
  const local = s.slice(0, i);
  const domain = s.slice(i + 1);
  return `${local.slice(0, 1) || "?"}***@${domain}`;
}

function parseTimestamps(row: BundleRow): BundleRow {
  const out = { ...row };
  for (const f of TIMESTAMP_FIELDS) {
    if (out[f] && typeof out[f] === "string") {
      const d = new Date(out[f] as string);
      if (Number.isNaN(d.getTime())) {
        console.warn(`[import] invalid timestamp string for field "${f}"; clearing value`);
        out[f] = null;
      } else {
        out[f] = d;
      }
    }
  }
  return out;
}

function getBundleRows(bundle: ExportBundle, tableName: string): BundleRow[] {
  const v = bundle.data[tableName];
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    const kind = v === null ? "null" : typeof v;
    throw new Error(`Invalid export bundle: data["${tableName}"] must be an array or omitted (got ${kind}).`);
  }
  return v as BundleRow[];
}

export function validateBundle(bundle: ExportBundle): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!bundle.metadata || bundle.metadata.schemaVersion !== 1) {
    errors.push({ table: "metadata", rowIndex: 0, field: "schemaVersion", message: "Unsupported schema version", severity: "error" });
    return { errors, warnings };
  }

  if (!bundle.data) {
    errors.push({ table: "metadata", rowIndex: 0, field: "data", message: "Missing data section", severity: "error" });
    return { errors, warnings };
  }

  const isUserBundle = bundle.metadata.exportMode === "user";

  const idSets: Record<string, Set<string>> = {};
  for (const tableName of TABLE_INSERT_ORDER) {
    const rows = getBundleRows(bundle, tableName);
    const pkField = PK_FIELD[tableName];
    idSets[tableName] = new Set(rows.map((r) => String(r[pkField])));
  }

  for (const tableName of TABLE_INSERT_ORDER) {
    const rows = getBundleRows(bundle, tableName);
    const fkRules = FK_RULES[tableName];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const rule of fkRules) {
        const fkValue = row[rule.field];
        if (fkValue === null || fkValue === undefined) continue;

        if (!idSets[rule.refTable].has(String(fkValue))) {
          if (rule.nullable || isUserBundle) {
            warnings.push({
              table: tableName, rowIndex: i, field: rule.field,
              message: `References ${rule.refTable}.${rule.refField}=${fkValue} not in export${isUserBundle ? " (user bundle — will be resolved at import or skipped)" : " (nullable FK)"}`,
              severity: "warning",
            });
          } else {
            errors.push({
              table: tableName, rowIndex: i, field: rule.field,
              message: `References ${rule.refTable}.${rule.refField}=${fkValue} not found in export`,
              severity: "error",
            });
          }
        }
      }
    }
  }

  return { errors, warnings };
}

export async function validateBundleWithDb(bundle: ExportBundle): Promise<{
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  conflicts: Record<string, number>;
}> {
  const base = validateBundle(bundle);
  const conflicts: Record<string, number> = {};

  const PK_EXISTENCE_CHUNK = 500;

  for (const tableName of TABLE_INSERT_ORDER) {
    const rows = getBundleRows(bundle, tableName);
    if (rows.length === 0) {
      conflicts[tableName] = 0;
      continue;
    }

    const table = TABLE_MAP[tableName];
    const pkField = PK_FIELD[tableName];
    const pkCol = (table as unknown as Record<string, unknown>)[pkField];
    let conflictCount = 0;

    if (pkCol) {
      const uniquePkStrings = [
        ...new Set(
          rows
            .map((r) => r[pkField])
            .filter((v) => v != null && v !== "")
            .map((v) => String(v)),
        ),
      ];

      const existingPkSet = new Set<string>();
      for (let o = 0; o < uniquePkStrings.length; o += PK_EXISTENCE_CHUNK) {
        const chunk = uniquePkStrings.slice(o, o + PK_EXISTENCE_CHUNK);
        if (chunk.length === 0) continue;
        const found = await db
          .select()
          .from(table as AnyPgTable)
          .where(inArray(pkCol as AnyPgColumn, chunk));
        for (const ex of found) {
          const rowObj = ex as Record<string, unknown>;
          const v = rowObj[pkField];
          if (v != null && v !== "") existingPkSet.add(String(v));
        }
      }

      for (const row of rows) {
        const pkValue = row[pkField];
        if (!pkValue) continue;
        if (existingPkSet.has(String(pkValue))) conflictCount++;
      }
    }

    conflicts[tableName] = conflictCount;
    if (conflictCount > 0) {
      base.warnings.push({
        table: tableName, rowIndex: -1, field: pkField,
        message: `${conflictCount} of ${rows.length} records already exist in database (will be skipped)`,
        severity: "warning",
      });
    }
  }

  return { ...base, conflicts };
}

function remapKey(table: string, id: string): string {
  return `${table}:${id}`;
}

function pkIsAlsoFk(tableName: TableName): boolean {
  const pk = PK_FIELD[tableName];
  return FK_RULES[tableName].some(r => r.field === pk);
}

function buildIdRemapTable(bundle: ExportBundle): Map<string, string> {
  const remap = new Map<string, string>();

  for (const tableName of TABLE_INSERT_ORDER) {
    if (pkIsAlsoFk(tableName)) continue;

    const rows = getBundleRows(bundle, tableName);
    const pkField = PK_FIELD[tableName];

    for (const row of rows) {
      const oldId = row[pkField];
      if (oldId) {
        const key = remapKey(tableName, String(oldId));
        if (!remap.has(key)) {
          remap.set(key, randomUUID());
        }
      }
    }
  }

  return remap;
}

function remapRow(row: BundleRow, tableName: TableName, pkField: string, idMap: Map<string, string>): BundleRow {
  const out = { ...row };

  const fkRules = FK_RULES[tableName];
  for (const rule of fkRules) {
    if (rule.deferredSecondPass) continue;
    const val = out[rule.field];
    if (val) {
      const fkKey = remapKey(rule.refTable, String(val));
      if (idMap.has(fkKey)) {
        out[rule.field] = idMap.get(fkKey);
      } else if (rule.nullable) {
        out[rule.field] = null;
      }
    }
  }

  if (!pkIsAlsoFk(tableName)) {
    const oldPk = row[pkField];
    if (oldPk) {
      const pkKey = remapKey(tableName, String(oldPk));
      if (idMap.has(pkKey)) {
        out[pkField] = idMap.get(pkKey);
      }
    }
  }

  return out;
}

const UNIQUE_FIELD_CHECKS: Partial<Record<TableName, { field: string; column: typeof users.email }[]>> = {
  users: [{ field: "email", column: users.email }],
};

async function checkUniqueConflict(tableName: TableName, row: BundleRow): Promise<boolean> {
  const checks = UNIQUE_FIELD_CHECKS[tableName];
  if (!checks) return false;
  for (const check of checks) {
    const val = row[check.field];
    if (val) {
      const [existing] = await db.select().from(TABLE_MAP[tableName] as AnyPgTable)
        .where(eq(check.column, String(val))).limit(1);
      if (existing) return true;
    }
  }
  return false;
}

export async function importBundle(
  bundle: ExportBundle,
  options: { dryRun?: boolean; mode?: "preserve" | "remap" } = {}
): Promise<ImportResult> {
  const { dryRun = false, mode = "preserve" } = options;

  const validation = validateBundle(bundle);
  if (validation.errors.length > 0) {
    return {
      success: false,
      dryRun,
      mode,
      inserted: {},
      skipped: {},
      conflicts: {},
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const idMap = mode === "remap" ? buildIdRemapTable(bundle) : null;

  const inserted: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const conflicts: Record<string, number> = {};
  /** Original PKs skipped during import, by table — used so dependent rows can be skipped. */
  const skippedIdsByTable: Record<string, Set<string>> = {};
  const trackSkippedId = (table: string, rawId: string | undefined) => {
    if (rawId === undefined || rawId === null) return;
    const id = String(rawId);
    if (!skippedIdsByTable[table]) skippedIdsByTable[table] = new Set();
    skippedIdsByTable[table].add(id);
  };

  if (dryRun) {
    for (const tableName of TABLE_INSERT_ORDER) {
      const rows = getBundleRows(bundle, tableName);
      if (rows.length === 0) {
        inserted[tableName] = 0;
        skipped[tableName] = 0;
        conflicts[tableName] = 0;
        continue;
      }

      if (mode === "remap") {
        const pkField = PK_FIELD[tableName];
        const fkRules = FK_RULES[tableName];
        let skipCount = 0;
        for (const row of rows) {
          const pkValue = row[pkField];
          let rowSkip = false;
          for (const rule of fkRules) {
            const fkVal = row[rule.field];
            if (fkVal === null || fkVal === undefined) continue;
            if (skippedIdsByTable[rule.refTable]?.has(String(fkVal)) && !rule.nullable) {
              rowSkip = true;
              break;
            }
          }
          if (rowSkip) {
            skipCount++;
            if (pkValue !== undefined && pkValue !== null) trackSkippedId(tableName, String(pkValue));
            continue;
          }
          if (await checkUniqueConflict(tableName, row)) {
            skipCount++;
            if (pkValue !== undefined && pkValue !== null) trackSkippedId(tableName, String(pkValue));
          }
        }
        inserted[tableName] = rows.length - skipCount;
        skipped[tableName] = skipCount;
        conflicts[tableName] = skipCount;
        if (skipCount > 0) {
          validation.warnings.push({
            table: tableName, rowIndex: -1, field: "unique",
            message: `${skipCount} record(s) will be skipped (unique conflicts and/or references to skipped parent rows)`,
            severity: "warning",
          });
        }
      } else {
        const table = TABLE_MAP[tableName];
        const pkField = PK_FIELD[tableName];
        const fkRules = FK_RULES[tableName];
        let conflictCount = 0;

        for (const row of rows) {
          const pkValue = row[pkField];
          if (!pkValue) continue;

          let refSkipped = false;
          for (const rule of fkRules) {
            const fkVal = row[rule.field];
            if (fkVal === null || fkVal === undefined) continue;
            if (skippedIdsByTable[rule.refTable]?.has(String(fkVal)) && !rule.nullable) {
              refSkipped = true;
              break;
            }
          }
          if (refSkipped) {
            conflictCount++;
            trackSkippedId(tableName, String(pkValue));
            continue;
          }

          const pkCol = (table as unknown as Record<string, unknown>)[pkField];
          if (pkCol) {
            const [existing] = await db.select().from(table as AnyPgTable).where(eq(pkCol as AnyPgColumn, String(pkValue))).limit(1);
            if (existing) {
              conflictCount++;
              trackSkippedId(tableName, String(pkValue));
              continue;
            }
          }
          if (tableName === "users" && row.email) {
            const [emailConflict] = await db.select().from(users).where(eq(users.email, String(row.email))).limit(1);
            if (emailConflict) {
              conflictCount++;
              trackSkippedId(tableName, String(pkValue));
            }
          }
        }

        inserted[tableName] = rows.length - conflictCount;
        skipped[tableName] = conflictCount;
        conflicts[tableName] = conflictCount;
      }
    }
    return {
      success: true,
      dryRun: true,
      mode,
      inserted,
      skipped,
      conflicts,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const bundleIsUserExport = bundle.metadata.exportMode === "user";
  const bundleIdSets: Record<string, Set<string>> = {};
  if (bundleIsUserExport) {
    for (const tn of TABLE_INSERT_ORDER) {
      const pkf = PK_FIELD[tn];
      bundleIdSets[tn] = new Set(getBundleRows(bundle, tn).map((r) => String(r[pkf])));
    }
  }

  try {
    await db.transaction(async (tx) => {
      const pendingUserBannedBy: { userId: string; oldBannedBy: string }[] = [];

      const insertRowTx = async (table: DrizzleTable, row: BundleRow): Promise<number> => {
        const inserted = await tx
          .insert(table as AnyPgTable)
          .values(row as Record<string, unknown>)
          .onConflictDoNothing()
          .returning();
        return inserted.length;
      };

      for (const tableName of TABLE_INSERT_ORDER) {
        const rows = getBundleRows(bundle, tableName);
        if (rows.length === 0) {
          inserted[tableName] = 0;
          skipped[tableName] = 0;
          conflicts[tableName] = 0;
          continue;
        }

        const table = TABLE_MAP[tableName];
        const pkField = PK_FIELD[tableName];
        let insertCount = 0;
        let skipCount = 0;
        let conflictCount = 0;

        for (let i = 0; i < rows.length; i++) {
          let row = parseTimestamps(rows[i]);
          const originalRow = rows[i];

          if (bundleIsUserExport) {
            const fkRules = FK_RULES[tableName];
            let hasUnresolvable = false;
            for (const rule of fkRules) {
              const fkVal = originalRow[rule.field];
              if (fkVal === null || fkVal === undefined) continue;
              const refIds = bundleIdSets[rule.refTable];
              if (refIds && !refIds.has(String(fkVal)) && !rule.nullable) {
                hasUnresolvable = true;
                break;
              }
            }
            if (hasUnresolvable) {
              const pkOrig = originalRow[pkField];
              if (pkOrig !== undefined && pkOrig !== null) {
                trackSkippedId(tableName, String(pkOrig));
              }
              skipCount++;
              continue;
            }
          }

          if ((mode === "remap" || mode === "preserve") && tableName !== "users") {
            const fkRules = FK_RULES[tableName];
            let referencesSkippedRow = false;
            for (const rule of fkRules) {
              const fkVal = originalRow[rule.field];
              if (fkVal === null || fkVal === undefined) continue;
              const refSkipped = skippedIdsByTable[rule.refTable];
              if (refSkipped?.has(String(fkVal))) {
                if (rule.nullable) {
                  row[rule.field] = null;
                } else {
                  referencesSkippedRow = true;
                  break;
                }
              }
            }
            if (referencesSkippedRow) {
              const pkOrig = originalRow[pkField];
              trackSkippedId(tableName, pkOrig !== undefined && pkOrig !== null ? String(pkOrig) : undefined);
              skipCount++;
              continue;
            }
          }

          if (idMap) {
            row = remapRow(row, tableName, pkField, idMap);
          }

          let pendingBannedByOldId: string | null = null;
          if (tableName === "users") {
            const rawBb = originalRow.bannedBy;
            if (rawBb !== null && rawBb !== undefined && String(rawBb).length > 0) {
              pendingBannedByOldId = String(rawBb);
            }
            row = { ...row, bannedBy: null };
          }

          const pkValue = row[pkField];
          const pkCol = (table as unknown as Record<string, unknown>)[pkField];

          if (mode === "preserve" && pkCol && pkValue) {
            const [existing] = await tx.select().from(table as AnyPgTable).where(eq(pkCol as AnyPgColumn, String(pkValue))).limit(1);
            if (existing) {
              const pkOrig = originalRow[pkField];
              if (pkOrig !== undefined && pkOrig !== null) {
                trackSkippedId(tableName, String(pkOrig));
              }
              skipCount++;
              conflictCount++;
              continue;
            }
          }

          if (mode === "remap" && tableName === "users" && idMap) {
            const email = row.email;
            if (email) {
              const [existingUser] = await tx.select().from(users).where(eq(users.email, String(email))).limit(1);
              if (existingUser) {
                const originalId = originalRow[pkField];
                if (originalId) {
                  trackSkippedId("users", String(originalId));
                }
                validation.warnings.push({
                  table: "users", rowIndex: i, field: "email",
                  message: `User with email ${maskEmailForImportWarning(String(email))} already exists — skipping user and all dependent records`,
                  severity: "warning",
                });
                skipCount++;
                conflictCount++;
                continue;
              }
            }
          }

          try {
            const affected = await insertRowTx(table, row);
            if (affected > 0) {
              insertCount++;
              if (tableName === "users" && pendingBannedByOldId && pkValue !== undefined && pkValue !== null) {
                pendingUserBannedBy.push({ userId: String(pkValue), oldBannedBy: pendingBannedByOldId });
              }
            } else {
              const pkOrig = originalRow[pkField];
              if (pkOrig !== undefined && pkOrig !== null) {
                if (mode === "remap" || mode === "preserve") {
                  trackSkippedId(tableName, String(pkOrig));
                }
              }
              skipCount++;
              conflictCount++;
            }
          } catch (rowErr: unknown) {
            const errMsg = rowErr instanceof Error ? rowErr.message.slice(0, 200) : "Insert failed";
            validation.errors.push({
              table: tableName,
              rowIndex: i,
              field: "insert",
              message: errMsg,
              severity: "error",
            });
            skipCount++;
          }
        }

        inserted[tableName] = insertCount;
        skipped[tableName] = skipCount;
        conflicts[tableName] = conflictCount;
      }

      for (const { userId, oldBannedBy } of pendingUserBannedBy) {
        let nextBannedBy: string | null = null;
        if (skippedIdsByTable.users?.has(oldBannedBy)) {
          nextBannedBy = null;
        } else if (mode === "remap" && idMap) {
          const key = remapKey("users", oldBannedBy);
          nextBannedBy = idMap.has(key) ? (idMap.get(key) as string) : oldBannedBy;
        } else {
          nextBannedBy = oldBannedBy;
        }
        await tx.update(users).set({ bannedBy: nextBannedBy }).where(eq(users.id, userId));
      }

      if (validation.errors.length > 0) {
        throw new Error("ROLLBACK_IMPORT");
      }
    });
  } catch (txErr: unknown) {
    if (txErr instanceof Error && txErr.message === "ROLLBACK_IMPORT") {
      return {
        success: false,
        dryRun: false,
        mode,
        inserted: {},
        skipped: {},
        conflicts: {},
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }
    throw txErr;
  }

  return {
    success: true,
    dryRun: false,
    mode,
    inserted,
    skipped,
    conflicts,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export async function importUserBundle(
  bundle: ExportBundle,
  targetUserId: string,
  options: { dryRun?: boolean } = {}
): Promise<ImportResult> {
  const { dryRun = false } = options;

  const validation = validateBundle(bundle);
  if (validation.errors.length > 0) {
    return {
      success: false,
      dryRun,
      mode: "remap",
      inserted: {},
      skipped: {},
      conflicts: {},
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const bundleUserRows = getBundleRows(bundle, "users");
  if (bundleUserRows.length !== 1) {
    return {
      success: false,
      dryRun,
      mode: "remap",
      inserted: {},
      skipped: {},
      conflicts: {},
      errors: [
        {
          table: "users",
          rowIndex: 0,
          field: "users",
          message: `User bundle must contain exactly one user row (found ${bundleUserRows.length})`,
          severity: "error",
        },
      ],
      warnings: validation.warnings,
    };
  }

  const skipTables = new Set(
    TABLE_INSERT_ORDER.filter(t => !USER_OWNED_TABLES.has(t))
  );

  const idMap = new Map<string, string>();

  const skippedIdsByTable: Record<string, Set<string>> = {};
  const trackSkippedIdUserBundle = (table: string, rawId: string | undefined) => {
    if (rawId === undefined || rawId === null) return;
    const id = String(rawId);
    if (!skippedIdsByTable[table]) skippedIdsByTable[table] = new Set();
    skippedIdsByTable[table].add(id);
  };

  const bundleUserIds = bundleUserRows.map((u) => String(u.id));
  for (const oldUserId of bundleUserIds) {
    idMap.set(remapKey("users", oldUserId), targetUserId);
  }

  for (const tableName of TABLE_INSERT_ORDER) {
    if (skipTables.has(tableName)) continue;
    if (pkIsAlsoFk(tableName)) continue;
    const rows = getBundleRows(bundle, tableName);
    const pkField = PK_FIELD[tableName];
    for (const row of rows) {
      const oldId = row[pkField];
      if (oldId) {
        const key = remapKey(tableName, String(oldId));
        if (!idMap.has(key)) {
          idMap.set(key, randomUUID());
        }
      }
    }
  }

  await reconcileBundleTaskIdMapForTasks({
    targetUserId,
    idMap,
    taskRows: getBundleRows(bundle, "tasks") as Record<string, unknown>[],
    remapKey,
  });

  const inserted: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const conflicts: Record<string, number> = {};
  const pendingTables: TableName[] = [];

  function hasUnresolvableFks(row: BundleRow, tableName: TableName): boolean {
    const fkRules = FK_RULES[tableName];
    for (const rule of fkRules) {
      if (skipTables.has(rule.refTable)) continue;
      const val = row[rule.field];
      if (val) {
        const fkKey = remapKey(rule.refTable, String(val));
        if (!idMap.has(fkKey) && !rule.nullable) {
          return true;
        }
      }
    }
    return false;
  }

  for (const tableName of TABLE_INSERT_ORDER) {
    if (skipTables.has(tableName)) {
      inserted[tableName] = 0;
      skipped[tableName] = getBundleRows(bundle, tableName).length;
      conflicts[tableName] = 0;
      continue;
    }

    const rows = getBundleRows(bundle, tableName);
    if (rows.length === 0) {
      inserted[tableName] = 0;
      skipped[tableName] = 0;
      conflicts[tableName] = 0;
      continue;
    }

    if (dryRun) {
      const table = TABLE_MAP[tableName];
      const pkField = PK_FIELD[tableName];
      let wouldInsert = 0;
      let wouldSkip = 0;
      let wouldConflict = 0;
      for (const row of rows) {
        if (hasUnresolvableFks(row, tableName)) {
          wouldSkip++;
          continue;
        }
        const remapped = remapRow(parseTimestamps(row), tableName, pkField, idMap);
        if (tableName === "userRewards" && remapped.rewardId) {
          const [catalogExists] = await db
            .select()
            .from(rewardsCatalog)
            .where(eq(rewardsCatalog.id, String(remapped.rewardId)))
            .limit(1);
          if (!catalogExists) {
            wouldSkip++;
            continue;
          }
        }
        const pkValue = remapped[pkField];
        if (pkValue) {
          const pkCol = (table as unknown as Record<string, unknown>)[pkField];
          if (pkCol) {
            const [existing] = await db.select().from(table as AnyPgTable)
              .where(eq(pkCol as AnyPgColumn, String(pkValue))).limit(1);
            if (existing) {
              wouldSkip++;
              wouldConflict++;
              continue;
            }
          }
        }
        if (await checkUniqueConflict(tableName, remapped)) {
          wouldSkip++;
          wouldConflict++;
          continue;
        }
        wouldInsert++;
      }
      inserted[tableName] = wouldInsert;
      skipped[tableName] = wouldSkip;
      conflicts[tableName] = wouldConflict;
      continue;
    }

    pendingTables.push(tableName);
  }

  if (dryRun) {
    return {
      success: validation.errors.length === 0,
      dryRun: true,
      mode: "remap",
      inserted,
      skipped,
      conflicts,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  try {
    await db.transaction(async (tx) => {
      const insertRowTx = async (table: DrizzleTable, row: BundleRow): Promise<number> => {
        const inserted = await tx
          .insert(table as AnyPgTable)
          .values(row as Record<string, unknown>)
          .onConflictDoNothing()
          .returning();
        return inserted.length;
      };

      for (const tableName of pendingTables) {
        const rows = getBundleRows(bundle, tableName);
        const table = TABLE_MAP[tableName];
        const pkField = PK_FIELD[tableName];
        let insertCount = 0;
        let skipCount = 0;
        let conflictCount = 0;

        for (let i = 0; i < rows.length; i++) {
          const rawRow = rows[i];

          if (hasUnresolvableFks(rawRow, tableName)) {
            validation.warnings.push({
              table: tableName, rowIndex: i, field: "fk",
              message: `Skipped row — references external data not in this user bundle`,
              severity: "warning",
            });
            skipCount++;
            continue;
          }

          let row = parseTimestamps(rawRow);
          row = remapRow(row, tableName, pkField, idMap);

          const fkRulesUser = FK_RULES[tableName];
          let referencesSkippedRow = false;
          for (const rule of fkRulesUser) {
            const fkVal = rawRow[rule.field];
            if (fkVal === null || fkVal === undefined) continue;
            const refSkipped = skippedIdsByTable[rule.refTable];
            if (refSkipped?.has(String(fkVal))) {
              if (rule.nullable) {
                row[rule.field] = null;
              } else {
                referencesSkippedRow = true;
                break;
              }
            }
          }
          if (referencesSkippedRow) {
            const pkOrig = rawRow[pkField];
            trackSkippedIdUserBundle(tableName, pkOrig !== undefined && pkOrig !== null ? String(pkOrig) : undefined);
            skipCount++;
            continue;
          }

          if (tableName === "userRewards" && row.rewardId) {
            const [catalogExists] = await tx.select().from(rewardsCatalog)
              .where(eq(rewardsCatalog.id, String(row.rewardId))).limit(1);
            if (!catalogExists) {
              validation.warnings.push({
                table: tableName, rowIndex: i, field: "rewardId",
                message: `Reward catalog item ${row.rewardId} not found in database, skipping`,
                severity: "warning",
              });
              skipCount++;
              continue;
            }
          }

          try {
            if (tableName === "tasks") {
              const outcome = await insertBundleTaskWithFingerprintClaimTx(tx, {
                targetUserId,
                taskRow: row as typeof tasks.$inferInsert,
                fingerprintSource: "user_bundle_import",
                fingerprintRow: row as Record<string, unknown>,
              });
              if (outcome === "inserted") {
                insertCount++;
              } else {
                const pkOrig = rawRow[pkField];
                if (pkOrig !== undefined && pkOrig !== null) {
                  trackSkippedIdUserBundle(tableName, String(pkOrig));
                }
                skipCount++;
                conflictCount++;
              }
            } else {
              const affected = await insertRowTx(table, row);
              if (affected > 0) {
                insertCount++;
              } else {
                const pkOrig = rawRow[pkField];
                if (pkOrig !== undefined && pkOrig !== null) {
                  trackSkippedIdUserBundle(tableName, String(pkOrig));
                }
                skipCount++;
                conflictCount++;
              }
            }
          } catch (rowErr: unknown) {
            const errMsg = rowErr instanceof Error ? rowErr.message.slice(0, 200) : "Insert failed";
            validation.errors.push({
              table: tableName,
              rowIndex: i,
              field: "insert",
              message: errMsg,
              severity: "error",
            });
            skipCount++;
          }
        }

        inserted[tableName] = insertCount;
        skipped[tableName] = skipCount;
        conflicts[tableName] = conflictCount;
      }

      if (validation.errors.length > 0) {
        throw new Error("ROLLBACK_IMPORT");
      }
    });
  } catch (txErr: unknown) {
    if (txErr instanceof Error && txErr.message === "ROLLBACK_IMPORT") {
      return {
        success: false,
        dryRun: false,
        mode: "remap",
        inserted: {},
        skipped: {},
        conflicts: {},
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }
    throw txErr;
  }

  return {
    success: true,
    dryRun: false,
    mode: "remap",
    inserted,
    skipped,
    conflicts,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}
