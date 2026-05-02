/**
 * Backup scheduler worker.
 *
 * Optionally runs periodic local JSON backups for all users.
 * Opt-in only: set BACKUP_SCHEDULER_ENABLED=true to activate.
 * Each run iterates over users, calls generateLocalBackup, and writes
 * a ledger record (backup_records) so the status endpoint can report
 * an honest lastServerBackupAt.
 *
 * Failures are per-user: one broken export does not abort the batch.
 */

import { generateLocalBackup, isAutomaticBackupsConfigured } from "../services/backup-service";
import { getUsersPaginated, getUserBackupPreference, cleanupBackupRecords } from "../storage";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_INITIAL_DELAY_MS = 5 * 60 * 1000; // 5min after boot
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 4;
const BATCH_DELAY_MS = 500; // brief pause between chunks to avoid hammering DB

export interface BackupSchedulerOptions {
  intervalMs?: number;
  initialDelayMs?: number;
  outputDir?: string;
}

/** Process an array of items with limited concurrency. */
async function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      try {
        const value = await fn(items[i]);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}



async function runBackupBatch(outputDir?: string): Promise<void> {
  const batchSize = Number(process.env.BACKUP_SCHEDULER_BATCH_SIZE) || DEFAULT_BATCH_SIZE;
  const concurrency = Number(process.env.BACKUP_SCHEDULER_CONCURRENCY) || DEFAULT_CONCURRENCY;
  const targetName = process.env.BACKUP_S3_TARGETS_JSON ? "multi_s3" : (process.env.BACKUP_S3_ENDPOINT ? "s3" : "local");

  let offset = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let totalUsers = 0;
  let hasMore = true;

  console.info(`[backup-scheduler] starting batch using target: ${targetName}, page size: ${batchSize}, concurrency: ${concurrency}`);

  while (hasMore) {
    const page = await getUsersPaginated(offset, batchSize);
    if (page.length === 0) {
      hasMore = false;
      break;
    }
    totalUsers += page.length;

    const results = await withConcurrency(
      page,
      concurrency,
      async (user) => {
        const pref = await getUserBackupPreference(user.id);
        if (pref && pref.autoBackupEnabled === false) {
          return { status: "skipped" as const, userId: user.id };
        }
        await generateLocalBackup(user.id, outputDir);
        return { status: "completed" as const, userId: user.id };
      },
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value.status === "skipped") {
          skipped += 1;
        } else {
          succeeded += 1;
        }
      } else {
        failed += 1;
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.warn(`[backup-scheduler] failed for user ${result.reason?.userId?.slice?.(0, 8) ?? "unknown"}:`, message);
      }
    }

    offset += page.length;
    hasMore = page.length === batchSize;

    if (hasMore) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.info(
    `[backup-scheduler] batch complete. ${succeeded} succeeded, ${failed} failed, ${skipped} skipped, ${totalUsers} total`,
  );

  // Run retention cleanup for all users that were processed
  if (totalUsers > 0) {
    console.info("[backup-scheduler] running retention cleanup…");
    let cleanedTotal = 0;
    let cleanupOffset = 0;
    let cleanupHasMore = true;
    while (cleanupHasMore) {
      const page = await getUsersPaginated(cleanupOffset, batchSize);
      if (page.length === 0) {
        cleanupHasMore = false;
        break;
      }
      for (const user of page) {
        try {
          const deleted = await cleanupBackupRecords(user.id);
          cleanedTotal += deleted;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[backup-scheduler] cleanup failed for user ${user.id.slice(0, 8)}:`, message);
        }
      }
      cleanupOffset += page.length;
      cleanupHasMore = page.length === batchSize;
    }
    console.info(`[backup-scheduler] retention cleanup complete. ${cleanedTotal} old records removed.`);
  }
}

/**
 * Background tick driver. Wire into server startup (see server/index.ts).
 * Returns a stop function.
 */
export function startBackupSchedulerTicker(
  options: BackupSchedulerOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const outputDir = options.outputDir || process.env.BACKUP_LOCAL_DIR || undefined;

  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    try {
      await runBackupBatch(outputDir);
    } catch (err) {
      console.warn("[backup-scheduler] tick failed:", (err as Error)?.message || String(err));
    }
  };

  const initialTimer = setTimeout(() => {
    void tick();
    intervalHandle = setInterval(() => {
      void tick();
    }, intervalMs);
  }, initialDelayMs);

  return () => {
    clearTimeout(initialTimer);
    if (intervalHandle !== null) clearInterval(intervalHandle);
  };
}
