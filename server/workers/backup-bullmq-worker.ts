/**
 * Redis-backed BullMQ worker for backup jobs.
 *
 * An alternative to the PostgreSQL-backed queue worker for higher throughput
 * and built-in dead-letter queues. Set BACKUP_BULLMQ_ENABLED=true and
 * REDIS_URL (or REDIS_HOST/REDIS_PORT) to activate.
 *
 * Producers (e.g., the scheduler tick or admin endpoint) add jobs to the
 * "backup-jobs" queue. This worker consumes them and calls generateLocalBackup.
 *
 * Queue naming: "backup-jobs" — one job per user backup.
 */

import { Queue, Worker, Job } from "bullmq";
import { generateLocalBackup } from "../services/backup-service";
import { cleanupBackupRecords } from "../storage";

interface BackupJobData {
  userId: string;
  outputDir?: string;
  type?: string;
}

function createRedisConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    return { url };
  }
  const host = process.env.REDIS_HOST || "localhost";
  const port = Number(process.env.REDIS_PORT) || 6379;
  const password = process.env.REDIS_PASSWORD;
  return { host, port, password };
}

let queue: Queue | null = null;
let worker: Worker | null = null;

export function getBackupQueue(): Queue {
  if (!queue) {
    queue = new Queue("backup-jobs", {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return queue;
}

async function processBackupJob(job: Job<BackupJobData>): Promise<string> {
  const { userId, outputDir, type = "scheduled" } = job.data;
  const result = await generateLocalBackup(userId, outputDir);
  try {
    await cleanupBackupRecords(userId);
  } catch (cleanupErr) {
    const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
    console.warn(`[backup-bullmq] cleanup failed for user ${userId.slice(0, 8)}:`, msg);
  }
  return result.filePath;
}

/**
 * Start a BullMQ worker. Returns a stop function.
 * Use in server/index.ts behind BACKUP_BULLMQ_ENABLED.
 */
export function startBackupBullmqWorker(): () => Promise<void> {
  const concurrency = Number(process.env.BACKUP_BULLMQ_CONCURRENCY) || 4;

  worker = new Worker("backup-jobs", processBackupJob, {
    connection: createRedisConnection(),
    concurrency,
  });

  worker.on("completed", (job) => {
    console.info(`[backup-bullmq] job ${job.id} completed for user ${job.data.userId.slice(0, 8)}`);
  });

  worker.on("failed", (job, err) => {
    console.warn(`[backup-bullmq] job ${job?.id} failed:`, err.message);
  });

  return async () => {
    await worker?.close();
    await queue?.close();
    worker = null;
    queue = null;
  };
}

/**
 * Enqueue a single backup job for a user.
 */
export async function enqueueBackupJob(data: BackupJobData): Promise<Job<BackupJobData>> {
  const q = getBackupQueue();
  return q.add("backup", data, {
    jobId: `backup-${data.userId}-${Date.now()}`,
  });
}

/**
 * Enqueue backup jobs for all users in a batch.
 */
export async function enqueueBackupBatchBullmq(
  userIds: string[],
  outputDir?: string,
): Promise<{ enqueued: number }> {
  const q = getBackupQueue();
  const jobs = userIds.map((userId) =>
    q.add("backup", { userId, outputDir, type: "scheduled" }, {
      jobId: `backup-${userId}-${Date.now()}`,
    }),
  );
  await Promise.all(jobs);
  return { enqueued: jobs.length };
}
