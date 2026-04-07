/**
 * ## Canonical task import deduplication (spreadsheet + JSON)
 *
 * AxTask has **two first-class import surfaces** for tasks. They must stay aligned:
 *
 * 1. **Spreadsheet / CSV / Excel** — `POST /api/tasks/import` in `server/routes.ts`
 * 2. **User JSON backup** — `importUserBundle()` in `server/migration/import.ts` (tasks rows)
 *
 * ### Invariants (do not bypass)
 *
 * - Both paths use the **same logical identity**: `computeTaskFingerprint()` in
 *   `task-fingerprint.ts` (normalized date, time, activity, notes → SHA-256).
 * - Both paths read/write **`task_import_fingerprints`** (see `hasImportFingerprint` /
 *   `recordImportFingerprint` in `storage.ts`). New code must use this module or those APIs,
 *   not ad-hoc equality checks.
 * - JSON bundle import **reconciles** bundle task IDs to existing tasks when a fingerprint
 *   already exists (`reconcileBundleTaskIdMapForTasks`), then **records** fingerprints for
 *   every processed task row in the same transaction as the task insert
 *   (`insertBundleTaskWithFingerprintClaimTx`).
 *
 * ### Why this matters (gamification / abuse)
 *
 * Coins, classification awards, confirmations, and completion bonuses are keyed by **`tasks.id`**.
 * If spreadsheet and JSON importers used different dedupe rules, users could end up with **two
 * rows for the same real-world task** and **double-claim** surfaces that are per-task-id. Keeping
 * one fingerprint pipeline preserves the same robustness goal as hardened print/checklist flows:
 * **one canonical task row per logical task** for a given user.
 *
 * @module import-task-dedupe
 */

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import type { InsertTask, Task } from "@shared/schema";
import { taskImportFingerprints, tasks } from "@shared/schema";
import { db } from "./db";
import { computeTaskFingerprint } from "./task-fingerprint";

/** Match `CLIENT_TASK_ID_UUID_RE` in `storage.ts` (avoid importing storage here). */
const CLIENT_TASK_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TaskImportFingerprintSource =
  | "bulk_import"
  | "manual_create"
  | "google_sheets_import"
  | "user_bundle_import";

export { computeTaskFingerprint };

/** Fingerprint from a raw bundle/export row (before or after timestamp parsing; date stays text). */
export function fingerprintFromBundleTaskRow(row: Record<string, unknown>): string {
  return computeTaskFingerprint({
    date: row.date != null ? String(row.date) : "",
    time: row.time != null ? String(row.time) : null,
    activity: row.activity != null ? String(row.activity) : null,
    notes: row.notes != null ? String(row.notes) : null,
  });
}

/** Map fingerprint → first task id for this user (for bundle ID reconciliation). */
export async function loadImportFingerprintIndex(userId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({
      fingerprint: taskImportFingerprints.fingerprint,
      firstTaskId: taskImportFingerprints.firstTaskId,
    })
    .from(taskImportFingerprints)
    .where(eq(taskImportFingerprints.userId, userId));
  const m = new Map<string, string>();
  for (const r of rows) {
    const tid = r.firstTaskId;
    if (typeof tid === "string" && tid.length > 0) {
      m.set(r.fingerprint, tid);
    }
  }
  return m;
}

export type RemapKeyFn = (table: string, id: string) => string;

/**
 * Before inserting bundle tasks, point bundle task PKs at existing DB tasks when fingerprints
 * match (e.g. user imported a spreadsheet first). Collapses duplicate fingerprints inside the
 * bundle to one new id.
 */
export async function reconcileBundleTaskIdMapForTasks(options: {
  targetUserId: string;
  idMap: Map<string, string>;
  taskRows: Record<string, unknown>[];
  remapKey: RemapKeyFn;
}): Promise<void> {
  const { targetUserId, idMap, taskRows, remapKey } = options;
  const fpIndex = await loadImportFingerprintIndex(targetUserId);
  const fpToCanonicalNewId = new Map<string, string>();

  for (const rawRow of taskRows) {
    const oldId = rawRow.id;
    if (oldId === undefined || oldId === null) continue;
    const key = remapKey("tasks", String(oldId));
    const fp = fingerprintFromBundleTaskRow(rawRow);

    const existingInDb = fpIndex.get(fp);
    if (existingInDb) {
      idMap.set(key, existingInDb);
      continue;
    }

    const assigned = idMap.get(key);
    if (!assigned) continue;

    const canon = fpToCanonicalNewId.get(fp);
    if (canon) {
      idMap.set(key, canon);
    } else {
      fpToCanonicalNewId.set(fp, assigned);
    }
  }
}

type BundleImportTx = Pick<typeof db, "insert" | "select" | "delete">;

/**
 * Claims the import fingerprint row before inserting the task so concurrent imports cannot
 * both miss the index and insert duplicate logical tasks. Rolls back a freshly claimed
 * fingerprint if the task PK insert loses an onConflict race.
 */
export async function insertBundleTaskWithFingerprintClaimTx(
  tx: BundleImportTx,
  params: {
    targetUserId: string;
    taskRow: typeof tasks.$inferInsert;
    fingerprintSource: TaskImportFingerprintSource;
    fingerprintRow: Record<string, unknown>;
  },
): Promise<"inserted" | "skipped_duplicate" | "skipped_pk_conflict"> {
  const { targetUserId, taskRow, fingerprintSource, fingerprintRow } = params;
  const taskPk = String(taskRow.id);
  const fp = fingerprintFromBundleTaskRow(fingerprintRow);

  const fpIns = await tx
    .insert(taskImportFingerprints)
    .values({
      id: randomUUID(),
      userId: targetUserId,
      fingerprint: fp,
      source: fingerprintSource,
      firstTaskId: taskPk,
    })
    .onConflictDoNothing()
    .returning({ id: taskImportFingerprints.id });

  if (fpIns.length === 0) {
    const [ex] = await tx
      .select({ firstTaskId: taskImportFingerprints.firstTaskId })
      .from(taskImportFingerprints)
      .where(
        and(eq(taskImportFingerprints.userId, targetUserId), eq(taskImportFingerprints.fingerprint, fp)),
      )
      .limit(1);
    const existingTid = ex?.firstTaskId;
    if (existingTid && existingTid !== taskPk) {
      return "skipped_duplicate";
    }
  }

  const inserted = await tx
    .insert(tasks)
    .values(taskRow)
    .onConflictDoNothing()
    .returning({ id: tasks.id });

  if (inserted.length === 0) {
    if (fpIns.length > 0) {
      await tx
        .delete(taskImportFingerprints)
        .where(
          and(eq(taskImportFingerprints.userId, targetUserId), eq(taskImportFingerprints.fingerprint, fp)),
        );
    }
    return "skipped_pk_conflict";
  }

  return "inserted";
}

export type ManualCreateWithFingerprintResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "fingerprint_duplicate"; serverTaskId?: string }
  | { ok: false; reason: "id_taken" };

/**
 * Atomic manual create: claim import fingerprint then insert task (same race window as bundle import).
 * Caller should run quota / isTaskIdTaken checks before calling when possible.
 */
export async function manualCreateTaskWithImportFingerprintClaim(
  userId: string,
  validatedData: InsertTask & { id?: string },
): Promise<ManualCreateWithFingerprintResult> {
  const { id: clientId, ...rest } = validatedData as InsertTask & { id?: string };
  let id: string;
  if (clientId != null && typeof clientId === "string" && clientId.length > 0) {
    if (!CLIENT_TASK_ID_UUID_RE.test(clientId)) {
      throw new Error("Invalid task id: client id must be a valid UUID");
    }
    id = clientId;
  } else {
    id = randomUUID();
  }

  const fp = computeTaskFingerprint(validatedData);
  const now = new Date();
  const taskRow: typeof tasks.$inferInsert = {
    ...rest,
    id,
    userId,
    priority: "Low",
    priorityScore: 0,
    classification: "General",
    isRepeated: false,
    createdAt: now,
    updatedAt: now,
  };

  return db.transaction(async (tx) => {
    const fpIns = await tx
      .insert(taskImportFingerprints)
      .values({
        id: randomUUID(),
        userId,
        fingerprint: fp,
        source: "manual_create",
        firstTaskId: id,
      })
      .onConflictDoNothing()
      .returning({ id: taskImportFingerprints.id });

    if (fpIns.length === 0) {
      const [ex] = await tx
        .select({ firstTaskId: taskImportFingerprints.firstTaskId })
        .from(taskImportFingerprints)
        .where(and(eq(taskImportFingerprints.userId, userId), eq(taskImportFingerprints.fingerprint, fp)))
        .limit(1);
      const existingTid = ex?.firstTaskId;
      if (existingTid && existingTid !== id) {
        return { ok: false as const, reason: "fingerprint_duplicate" as const, serverTaskId: existingTid };
      }
    }

    const inserted = await tx.insert(tasks).values(taskRow).onConflictDoNothing().returning();
    if (inserted.length === 0) {
      if (fpIns.length > 0) {
        await tx
          .delete(taskImportFingerprints)
          .where(and(eq(taskImportFingerprints.userId, userId), eq(taskImportFingerprints.fingerprint, fp)));
      }
      const [existing] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
        .limit(1);
      if (existing) {
        const existingFp = computeTaskFingerprint({
          date: existing.date ?? "",
          time: existing.time ?? null,
          activity: existing.activity ?? null,
          notes: existing.notes ?? null,
        });
        if (existingFp === fp) {
          return { ok: true as const, task: existing };
        }
        return { ok: false as const, reason: "id_taken" as const };
      }
      return { ok: false as const, reason: "id_taken" as const };
    }

    return { ok: true as const, task: inserted[0]! };
  });
}
