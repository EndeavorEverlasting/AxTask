/**
 * PostgreSQL-backed queue worker for backup jobs.
 *
 * Replaces the tick-based scheduler with a persistent job queue.
 * Workers poll for pending jobs, claim them (update status to running),
 * execute the backup, and mark them completed or failed.
 *
 * Horizontal scaling: multiple server instances can each run this worker
 * against the same PostgreSQL database. The first-come-first-served claim
 * via status update acts as a distributed lock.
 *
 * Backpressure: the polling interval naturally limits throughput. Increase
 * concurrency or decrease interval to scale up.
 */

import { generateLocalBackup } from "../services/backup-service";
import {
  getNextPendingBackupJob,
  markBackupJobRunning,
  markBackupJobCompleted,
  markBackupJobFailed,
  cleanupBackupRecords,
} from "../storage";

const DEFAULT_POLL_INTERVAL_MS = 30_000; // 30s
const DEFAULT_CONCURRENCY = 4;

export interface BackupQueueWorkerOptions {
  pollIntervalMs?: number;
  concurrency?: number;
  outputDir?: string;
}

async function processOneJob(outputDir?: string): Promise<void> {
  const job = await getNextPendingBackupJob();
  if (!job) return;

  const claimed = await markBackupJobRunning(job.id);
  if (!claimed) {
    // Another worker claimed it between select and update
    return;
  }

  try {
    const result = await generateLocalBackup(job.userId, outputDir);
    await markBackupJobCompleted(job.id, result.filePath);
    // Run retention cleanup for this user after a successful backup
    try {
      await cleanupBackupRecords(job.userId);
    } catch (cleanupErr) {
      const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      console.warn(`[backup-queue] cleanup failed for user ${job.userId.slice(0, 8)}:`, msg);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[backup-queue] job ${job.id.slice(0, 8)} failed for user ${job.userId.slice(0, 8)}:`, message);
    await markBackupJobFailed(job.id, message);
  }
}

/**
 * Start a persistent queue worker. Returns a stop function.
 * Use in server/index.ts behind BACKUP_QUEUE_WORKER_ENABLED.
 */
export function startBackupQueueWorker(
  options: BackupQueueWorkerOptions = {},
): () => void {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const outputDir = options.outputDir || process.env.BACKUP_LOCAL_DIR || undefined;

  let running = true;
  let activeWorkers = 0;

  async function pollLoop(): Promise<void> {
    while (running) {
      // Start up to `concurrency` workers in parallel
      const workers = Array.from({ length: concurrency }, () => processOneJob(outputDir));
      activeWorkers = concurrency;
      await Promise.allSettled(workers);
      activeWorkers = 0;

      if (running) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
    }
  }

  // Fire-and-forget the loop
  void pollLoop().catch((err) => {
    console.error("[backup-queue] worker loop crashed:", err instanceof Error ? err.message : String(err));
  });

  return () => {
    running = false;
  };
}

/**
 * Create a batch of backup jobs for all users. Call from the scheduler
 * or an admin endpoint to enqueue the next round of backups.
 */
export async function enqueueBackupBatch(
  getUserIds: () => Promise<string[]>,
  type: string = "scheduled",
): Promise<{ enqueued: number; skipped: number }> {
  const { createBackupJob } = await import("../storage");
  const userIds = await getUserIds();
  let enqueued = 0;
  let skipped = 0;

  for (const userId of userIds) {
    try {
      await createBackupJob({ userId, type });
      enqueued += 1;
    } catch (err) {
      skipped += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[backup-queue] failed to enqueue job for user ${userId.slice(0, 8)}:`, msg);
    }
  }

  return { enqueued, skipped };
}
