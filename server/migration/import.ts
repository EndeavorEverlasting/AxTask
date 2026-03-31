import { db } from "../db";
import { randomUUID } from "crypto";
import {
  users, tasks, passwordResetTokens, securityLogs,
  wallets, coinTransactions, userBadges, rewardsCatalog,
  userRewards, taskCollaborators, taskPatterns,
  classificationContributions, classificationConfirmations,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import type { ExportBundle } from "./export";

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
  "rewardsCatalog",
  "tasks",
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

type DrizzleTable = typeof users | typeof rewardsCatalog | typeof tasks | typeof wallets |
  typeof coinTransactions | typeof userBadges | typeof userRewards | typeof taskPatterns |
  typeof taskCollaborators | typeof classificationContributions | typeof classificationConfirmations |
  typeof passwordResetTokens | typeof securityLogs;

const TABLE_MAP: Record<TableName, DrizzleTable> = {
  users,
  rewardsCatalog,
  tasks,
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
  rewardsCatalog: "id",
  tasks: "id",
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
}

const FK_RULES: Record<TableName, FkRule[]> = {
  users: [{ field: "bannedBy", refTable: "users", refField: "id", nullable: true }],
  rewardsCatalog: [],
  tasks: [{ field: "userId", refTable: "users", refField: "id" }],
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
  rewardsCatalog: [],
  tasks: ["userId"],
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

const USER_OWNED_TABLES = new Set<string>([
  "tasks", "wallets", "coinTransactions", "userBadges",
  "userRewards", "taskPatterns", "taskCollaborators",
  "classificationContributions", "classificationConfirmations",
]);

const TIMESTAMP_FIELDS = [
  "createdAt", "updatedAt", "expiresAt", "usedAt", "bannedAt",
  "lockedUntil", "earnedAt", "redeemedAt", "lastSeen", "invitedAt",
];

function parseTimestamps(row: BundleRow): BundleRow {
  const out = { ...row };
  for (const f of TIMESTAMP_FIELDS) {
    if (out[f] && typeof out[f] === "string") {
      out[f] = new Date(out[f] as string);
    }
  }
  return out;
}

function getBundleRows(bundle: ExportBundle, tableName: string): BundleRow[] {
  return (bundle.data[tableName] || []) as BundleRow[];
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

        if (isUserBundle && rule.refTable === "rewardsCatalog") {
          continue;
        }

        if (isUserBundle && rule.refTable === "users" && rule.field === "userId" &&
            (tableName === "classificationConfirmations" || tableName === "taskCollaborators")) {
          continue;
        }

        if (!idSets[rule.refTable].has(String(fkValue))) {
          if (rule.nullable) {
            warnings.push({
              table: tableName, rowIndex: i, field: rule.field,
              message: `References ${rule.refTable}.${rule.refField}=${fkValue} not in export (nullable FK)`,
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

  for (const tableName of TABLE_INSERT_ORDER) {
    const rows = getBundleRows(bundle, tableName);
    if (rows.length === 0) {
      conflicts[tableName] = 0;
      continue;
    }

    const table = TABLE_MAP[tableName];
    const pkField = PK_FIELD[tableName];
    let conflictCount = 0;

    for (const row of rows) {
      const pkValue = row[pkField];
      if (!pkValue) continue;
      const pkCol = (table as Record<string, unknown>)[pkField];
      if (pkCol) {
        const [existing] = await db.select().from(table as typeof users).where(eq(pkCol as typeof users.id, String(pkValue))).limit(1);
        if (existing) conflictCount++;
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
    const val = out[rule.field];
    if (val) {
      const fkKey = remapKey(rule.refTable, String(val));
      if (idMap.has(fkKey)) {
        out[rule.field] = idMap.get(fkKey);
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
      const [existing] = await db.select().from(TABLE_MAP[tableName] as typeof users)
        .where(eq(check.column, String(val))).limit(1);
      if (existing) return true;
    }
  }
  return false;
}

async function insertRow(table: DrizzleTable, row: BundleRow): Promise<number> {
  const result = await db.insert(table as typeof users).values(row as typeof users.$inferInsert).onConflictDoNothing();
  return (result as { rowCount?: number }).rowCount ?? 0;
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
  const skippedUserIds = new Set<string>();

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
        let uniqueConflicts = 0;
        for (const row of rows) {
          if (await checkUniqueConflict(tableName, row)) {
            uniqueConflicts++;
          }
        }
        inserted[tableName] = rows.length - uniqueConflicts;
        skipped[tableName] = uniqueConflicts;
        conflicts[tableName] = uniqueConflicts;
        if (uniqueConflicts > 0) {
          validation.warnings.push({
            table: tableName, rowIndex: -1, field: "unique",
            message: `${uniqueConflicts} records have unique constraint conflicts (e.g. duplicate email) and will be skipped`,
            severity: "warning",
          });
        }
      } else {
        const table = TABLE_MAP[tableName];
        const pkField = PK_FIELD[tableName];
        let conflictCount = 0;

        for (const row of rows) {
          const pkValue = row[pkField];
          if (!pkValue) continue;
          const pkCol = (table as Record<string, unknown>)[pkField];
          if (pkCol) {
            const [existing] = await db.select().from(table as typeof users).where(eq(pkCol as typeof users.id, String(pkValue))).limit(1);
            if (existing) conflictCount++;
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

      if (mode === "remap" && tableName !== "users" && skippedUserIds.size > 0) {
        const rowUserId = originalRow.userId;
        if (rowUserId && skippedUserIds.has(String(rowUserId))) {
          skipCount++;
          continue;
        }
      }

      if (idMap) {
        row = remapRow(row, tableName, pkField, idMap);
      }

      const pkValue = row[pkField];
      const pkCol = (table as Record<string, unknown>)[pkField];

      if (mode === "preserve" && pkCol && pkValue) {
        const [existing] = await db.select().from(table as typeof users).where(eq(pkCol as typeof users.id, String(pkValue))).limit(1);
        if (existing) {
          skipCount++;
          conflictCount++;
          continue;
        }
      }

      if (mode === "remap" && tableName === "users" && idMap) {
        const email = row.email;
        if (email) {
          const [existingUser] = await db.select().from(users).where(eq(users.email, String(email))).limit(1);
          if (existingUser) {
            const originalId = originalRow[pkField];
            if (originalId) {
              skippedUserIds.add(String(originalId));
            }
            validation.warnings.push({
              table: "users", rowIndex: i, field: "email",
              message: `User with email ${email} already exists — skipping user and all dependent records`,
              severity: "warning",
            });
            skipCount++;
            conflictCount++;
            continue;
          }
        }
      }

      try {
        const affected = await insertRow(table, row);
        if (affected > 0) {
          insertCount++;
        } else {
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

  return {
    success: validation.errors.length === 0,
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

  const skipTables = new Set(
    TABLE_INSERT_ORDER.filter(t => !USER_OWNED_TABLES.has(t))
  );

  const idMap = new Map<string, string>();

  const bundleUserIds = getBundleRows(bundle, "users").map((u) => String(u.id));
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

  const inserted: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const conflicts: Record<string, number> = {};

  function hasUnresolvableFks(row: BundleRow, tableName: TableName): boolean {
    const fkRules = FK_RULES[tableName];
    for (const rule of fkRules) {
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
        const pkValue = remapped[pkField];
        if (pkValue) {
          const pkCol = (table as Record<string, unknown>)[pkField];
          if (pkCol) {
            const [existing] = await db.select().from(table as typeof users)
              .where(eq(pkCol as typeof users.id, String(pkValue))).limit(1);
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

    const table = TABLE_MAP[tableName];
    const pkField = PK_FIELD[tableName];
    let insertCount = 0;
    let skipCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];

      if (hasUnresolvableFks(rawRow, tableName)) {
        skipCount++;
        continue;
      }

      let row = parseTimestamps(rawRow);
      row = remapRow(row, tableName, pkField, idMap);

      if (tableName === "userRewards" && row.rewardId) {
        const [catalogExists] = await db.select().from(rewardsCatalog)
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
        const affected = await insertRow(table, row);
        if (affected > 0) {
          insertCount++;
        } else {
          skipCount++;
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
    conflicts[tableName] = 0;
  }

  return {
    success: validation.errors.length === 0,
    dryRun,
    mode: "remap",
    inserted,
    skipped,
    conflicts,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}
