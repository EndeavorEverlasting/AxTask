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

const TABLE_MAP: Record<TableName, any> = {
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

const FK_RULES: Record<TableName, Array<{ field: string; refTable: TableName; refField: string; nullable?: boolean }>> = {
  users: [],
  rewardsCatalog: [],
  tasks: [{ field: "userId", refTable: "users", refField: "id" }],
  wallets: [{ field: "userId", refTable: "users", refField: "id" }],
  coinTransactions: [{ field: "userId", refTable: "users", refField: "id" }],
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

function parseTimestamps(row: any): any {
  const out = { ...row };
  const tsFields = [
    "createdAt", "updatedAt", "expiresAt", "usedAt", "bannedAt",
    "lockedUntil", "earnedAt", "redeemedAt", "lastSeen", "invitedAt",
  ];
  for (const f of tsFields) {
    if (out[f] && typeof out[f] === "string") {
      out[f] = new Date(out[f]);
    }
  }
  return out;
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

  const idSets: Record<string, Set<string>> = {};
  for (const tableName of TABLE_INSERT_ORDER) {
    const rows = bundle.data[tableName] || [];
    const pkField = PK_FIELD[tableName];
    idSets[tableName] = new Set(rows.map((r: any) => r[pkField]));
  }

  for (const tableName of TABLE_INSERT_ORDER) {
    const rows = bundle.data[tableName] || [];
    const fkRules = FK_RULES[tableName];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const rule of fkRules) {
        const fkValue = row[rule.field];
        if (fkValue === null || fkValue === undefined) continue;
        if (!idSets[rule.refTable].has(fkValue)) {
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
    const rows = bundle.data[tableName] || [];
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
      const pkCol = (table as any)[pkField];
      if (pkCol) {
        const [existing] = await db.select().from(table).where(eq(pkCol, pkValue)).limit(1);
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

function buildIdRemapTable(bundle: ExportBundle): Map<string, string> {
  const remap = new Map<string, string>();

  for (const tableName of TABLE_INSERT_ORDER) {
    const rows = bundle.data[tableName] || [];
    const pkField = PK_FIELD[tableName];

    for (const row of rows) {
      const oldId = row[pkField];
      if (oldId && !remap.has(oldId)) {
        remap.set(oldId, randomUUID());
      }
    }
  }

  return remap;
}

function remapRow(row: any, tableName: TableName, pkField: string, idMap: Map<string, string>): any {
  const out = { ...row };

  const oldPk = out[pkField];
  if (oldPk && idMap.has(oldPk)) {
    out[pkField] = idMap.get(oldPk);
  }

  const fkFields = FK_FIELDS_BY_TABLE[tableName] || [];
  for (const field of fkFields) {
    if (out[field] && idMap.has(out[field])) {
      out[field] = idMap.get(out[field]);
    }
  }

  return out;
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

  if (dryRun) {
    for (const tableName of TABLE_INSERT_ORDER) {
      const rows = bundle.data[tableName] || [];
      if (rows.length === 0) {
        inserted[tableName] = 0;
        skipped[tableName] = 0;
        conflicts[tableName] = 0;
        continue;
      }

      if (mode === "remap") {
        inserted[tableName] = rows.length;
        skipped[tableName] = 0;
        conflicts[tableName] = 0;
      } else {
        const table = TABLE_MAP[tableName];
        const pkField = PK_FIELD[tableName];
        let conflictCount = 0;

        for (const row of rows) {
          const pkValue = row[pkField];
          if (!pkValue) continue;
          const pkCol = (table as any)[pkField];
          if (pkCol) {
            const [existing] = await db.select().from(table).where(eq(pkCol, pkValue)).limit(1);
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
    const rows = bundle.data[tableName] || [];
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

    for (const rawRow of rows) {
      let row = parseTimestamps(rawRow);

      if (idMap) {
        row = remapRow(row, tableName, pkField, idMap);
      }

      const pkValue = row[pkField];
      const pkCol = (table as any)[pkField];

      if (mode === "preserve" && pkCol && pkValue) {
        const [existing] = await db.select().from(table).where(eq(pkCol, pkValue)).limit(1);
        if (existing) {
          skipCount++;
          conflictCount++;
          continue;
        }
      }

      try {
        const result = await db.insert(table).values(row).onConflictDoNothing();
        const affected = (result as any).rowCount ?? 1;
        if (affected > 0) {
          insertCount++;
        } else {
          skipCount++;
          conflictCount++;
        }
      } catch (rowErr: any) {
        validation.errors.push({
          table: tableName,
          rowIndex: rows.indexOf(rawRow),
          field: "insert",
          message: rowErr.message?.slice(0, 200) || "Insert failed",
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

  const idMap = buildIdRemapTable(bundle);

  const bundleUserIds = (bundle.data.users || []).map((u: any) => u.id);
  for (const oldUserId of bundleUserIds) {
    idMap.set(oldUserId, targetUserId);
  }

  const inserted: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const conflicts: Record<string, number> = {};

  const USER_OWNED_TABLES = new Set([
    "tasks", "wallets", "coinTransactions", "userBadges",
    "userRewards", "taskPatterns", "taskCollaborators",
    "classificationContributions", "classificationConfirmations",
  ]);

  const skipTables = new Set(
    TABLE_INSERT_ORDER.filter(t => !USER_OWNED_TABLES.has(t))
  );

  for (const tableName of TABLE_INSERT_ORDER) {
    if (skipTables.has(tableName)) {
      inserted[tableName] = 0;
      skipped[tableName] = (bundle.data[tableName] || []).length;
      conflicts[tableName] = 0;
      continue;
    }

    const rows = bundle.data[tableName] || [];
    if (rows.length === 0) {
      inserted[tableName] = 0;
      skipped[tableName] = 0;
      conflicts[tableName] = 0;
      continue;
    }

    if (dryRun) {
      inserted[tableName] = rows.length;
      skipped[tableName] = 0;
      conflicts[tableName] = 0;
      continue;
    }

    const table = TABLE_MAP[tableName];
    const pkField = PK_FIELD[tableName];
    let insertCount = 0;
    let skipCount = 0;

    for (const rawRow of rows) {
      let row = parseTimestamps(rawRow);
      row = remapRow(row, tableName, pkField, idMap);

      try {
        const result = await db.insert(table).values(row).onConflictDoNothing();
        const affected = (result as any).rowCount ?? 1;
        if (affected > 0) {
          insertCount++;
        } else {
          skipCount++;
        }
      } catch (rowErr: any) {
        validation.errors.push({
          table: tableName,
          rowIndex: rows.indexOf(rawRow),
          field: "insert",
          message: rowErr.message?.slice(0, 200) || "Insert failed",
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
