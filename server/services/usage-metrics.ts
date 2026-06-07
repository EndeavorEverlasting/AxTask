export function deriveLatestMetrics(latestRow?: {
  source?: string | null;
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
      source: "internal_derived",
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
    source: latestRow.source ?? "internal_derived",
  };
}
