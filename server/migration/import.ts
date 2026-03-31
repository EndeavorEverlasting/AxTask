import { db } from "../db";
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
  inserted: Record<string, number>;
  skipped: Record<string, number>;
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

const FK_RULES: Record<TableName, Array<{ field: string; refTable: TableName; refField: string }>> = {
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
    { field: "userId", refTable: "users", refField: "id" },
    { field: "targetUserId", refTable: "users", refField: "id" },
  ],
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
          if (tableName === "securityLogs" && (rule.field === "userId" || rule.field === "targetUserId")) {
            warnings.push({
              table: tableName, rowIndex: i, field: rule.field,
              message: `References ${rule.refTable}.${rule.refField}=${fkValue} not in export (nullable FK, will be kept)`,
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

export async function importBundle(
  bundle: ExportBundle,
  options: { dryRun?: boolean } = {}
): Promise<ImportResult> {
  const { dryRun = false } = options;

  const validation = validateBundle(bundle);
  if (validation.errors.length > 0 && !dryRun) {
    return {
      success: false,
      dryRun,
      inserted: {},
      skipped: {},
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const inserted: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  if (dryRun) {
    for (const tableName of TABLE_INSERT_ORDER) {
      const rows = bundle.data[tableName] || [];
      inserted[tableName] = rows.length;
      skipped[tableName] = 0;
    }
    return {
      success: validation.errors.length === 0,
      dryRun: true,
      inserted,
      skipped,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const BATCH_SIZE = 500;

  for (const tableName of TABLE_INSERT_ORDER) {
    const rows = bundle.data[tableName] || [];
    if (rows.length === 0) {
      inserted[tableName] = 0;
      skipped[tableName] = 0;
      continue;
    }

    const table = TABLE_MAP[tableName];
    const pkField = PK_FIELD[tableName];
    let insertCount = 0;
    let skipCount = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const rowsToInsert: any[] = [];

      for (const rawRow of batch) {
        const row = parseTimestamps(rawRow);
        const pkValue = row[pkField];

        const pkCol = (table as any)[pkField];
        if (pkCol) {
          const [existing] = await db.select().from(table).where(eq(pkCol, pkValue)).limit(1);
          if (existing) {
            skipCount++;
            continue;
          }
        }
        rowsToInsert.push(row);
      }

      if (rowsToInsert.length > 0) {
        for (const singleRow of rowsToInsert) {
          try {
            const result = await db.insert(table).values(singleRow).onConflictDoNothing();
            const affected = (result as any).rowCount ?? 1;
            if (affected > 0) {
              insertCount++;
            } else {
              skipCount++;
            }
          } catch (rowErr: any) {
            validation.errors.push({
              table: tableName,
              rowIndex: i,
              field: "insert",
              message: rowErr.message?.slice(0, 200) || "Insert failed",
              severity: "error",
            });
            skipCount++;
          }
        }
      }
    }

    inserted[tableName] = insertCount;
    skipped[tableName] = skipCount;
  }

  return {
    success: validation.errors.length === 0,
    dryRun: false,
    inserted,
    skipped,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}
