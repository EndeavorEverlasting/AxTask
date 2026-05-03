type UsageOverview = {
  latest: {
    requests: number;
    errors: number;
    errorRate: number;
    p95Ms: number;
    dbStorageMb: number;
    taskCount: number;
    attachmentBytes: number;
    spendMtdCents: number;
  };
  series: Array<any>;
};

async function estimateDbStorageMb(): Promise<number> {
  try {
    const { pool } = await import("../db");
    const result = await pool.query(`
      SELECT ROUND(pg_database_size(current_database())::numeric / 1024 / 1024)::int AS value
    `);
    return Number(result.rows?.[0]?.value) || 0;
  } catch {
    return 0;
  }
}

export async function captureUsageSnapshot(userId: string): Promise<void> {
  const { getStorageUsage, saveUsageSnapshot } = await import("../storage");
  const storage = await getStorageUsage(userId);
  const today = new Date().toISOString().slice(0, 10);
  const dbStorageMb = await estimateDbStorageMb();

  // Internal-only approximation until provider ingestion is wired.
  await saveUsageSnapshot({
    snapshotDate: today,
    source: "internal",
    requests: Math.max(1, storage.taskCount * 3),
    errors: 0,
    p95Ms: 120,
    dbStorageMb,
    taskCount: storage.taskCount,
    attachmentBytes: storage.attachmentBytes,
    spendMtdCents: 0,
  });
}

export async function getUsageOverview(): Promise<UsageOverview> {
  const { getUsageSnapshots } = await import("../storage");
  const series = await getUsageSnapshots(60);
  return { latest: deriveLatestMetrics(series[0]), series };
}

export async function runRetentionDryRun(userId: string, retentionDays: number) {
  const { getStorageUsage } = await import("../storage");
  const storage = await getStorageUsage(userId);
  return {
    userId,
    retentionDays,
    estimatedTaskCount: storage.taskCount,
    estimatedAttachmentBytes: storage.attachmentBytes,
    action: "dry-run-only",
  };
}

export function deriveLatestMetrics(latestRow?: {
  requests?: number | null;
  errors?: number | null;
  p95Ms?: number | null;
  dbStorageMb?: number | null;
  taskCount?: number | null;
  attachmentBytes?: number | null;
  spendMtdCents?: number | null;
}) {
  if (!latestRow) {
    return {
      requests: 0,
      errors: 0,
      errorRate: 0,
      p95Ms: 0,
      dbStorageMb: 0,
      taskCount: 0,
      attachmentBytes: 0,
      spendMtdCents: 0,
    };
  }
  const requests = Number(latestRow.requests) || 0;
  const errors = Number(latestRow.errors) || 0;
  return {
    requests,
    errors,
    errorRate: requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0,
    p95Ms: Number(latestRow.p95Ms) || 0,
    dbStorageMb: Number(latestRow.dbStorageMb) || 0,
    taskCount: Number(latestRow.taskCount) || 0,
    attachmentBytes: Number(latestRow.attachmentBytes) || 0,
    spendMtdCents: Number(latestRow.spendMtdCents) || 0,
  };
}
