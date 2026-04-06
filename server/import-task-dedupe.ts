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
 *   (`insertTaskImportFingerprintTx`).
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
import { eq } from "drizzle-orm";
import { taskImportFingerprints } from "@shared/schema";
import { db } from "./db";
import { computeTaskFingerprint } from "./task-fingerprint";

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

type TxLike = Pick<typeof db, "insert">;

/** Register fingerprint in the same transaction as the task row (JSON bundle path). */
export async function insertTaskImportFingerprintTx(
  tx: TxLike,
  params: {
    userId: string;
    taskPk: string;
    row: Record<string, unknown>;
    source: TaskImportFingerprintSource;
  },
): Promise<void> {
  const { userId, taskPk, row, source } = params;
  await tx
    .insert(taskImportFingerprints)
    .values({
      id: randomUUID(),
      userId,
      fingerprint: fingerprintFromBundleTaskRow(row),
      source,
      firstTaskId: taskPk,
    })
    .onConflictDoNothing();
}
