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
import { getAllUsers, getUserBackupPreference } from "../storage";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_INITIAL_DELAY_MS = 5 * 60 * 1000; // 5min after boot
const DEFAULT_BATCH_SIZE = 100;
const BATCH_DELAY_MS = 500; // brief pause between chunks to avoid hammering DB

export interface BackupSchedulerOptions {
  intervalMs?: number;
  initialDelayMs?: number;
  outputDir?: string;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function runBackupBatch(outputDir?: string): Promise<void> {
  const users = await getAllUsers();
  const batchSize = Number(process.env.BACKUP_SCHEDULER_BATCH_SIZE) || DEFAULT_BATCH_SIZE;
  const chunks = chunkArray(users, batchSize);
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  const targetName = process.env.BACKUP_S3_ENDPOINT ? "s3" : "local";
  console.info(
    `[backup-scheduler] starting batch for ${users.length} users in ${chunks.length} chunk(s) using target: ${targetName}`,
  );

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    for (const user of chunk) {
      try {
        const pref = await getUserBackupPreference(user.id);
        if (pref && pref.autoBackupEnabled === false) {
          skipped += 1;
          continue;
        }
        await generateLocalBackup(user.id, outputDir);
        succeeded += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[backup-scheduler] failed for user ${user.id.slice(0, 8)}:`, message);
      }
    }
    if (chunkIndex < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.info(
    `[backup-scheduler] batch complete. ${succeeded} succeeded, ${failed} failed, ${skipped} skipped, ${users.length} total`,
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
