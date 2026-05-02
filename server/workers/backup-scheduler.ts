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
import { getAllUsers } from "../storage";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_INITIAL_DELAY_MS = 5 * 60 * 1000; // 5min after boot

export interface BackupSchedulerOptions {
  intervalMs?: number;
  initialDelayMs?: number;
  outputDir?: string;
}

async function runBackupBatch(outputDir?: string): Promise<void> {
  const users = await getAllUsers();
  let succeeded = 0;
  let failed = 0;

  const targetName = process.env.BACKUP_S3_ENDPOINT ? "s3" : "local";
  console.info(`[backup-scheduler] starting batch for ${users.length} users using target: ${targetName}`);

  for (const user of users) {
    try {
      await generateLocalBackup(user.id, outputDir);
      succeeded += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[backup-scheduler] failed for user ${user.id.slice(0, 8)}:`, message);
    }
  }

  console.info(
    `[backup-scheduler] batch complete. ${succeeded} succeeded, ${failed} failed, ${users.length} total`,
  );
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
