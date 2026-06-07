import { getAttributionForUsage } from "../monitoring/ops-snapshot";
import { getApiPerformanceHeuristics } from "./api-performance-service";
import { getProviderMtdSummary, deriveSpendMtdCents, isProviderDataStale } from "./provider-usage-service";
import { getUsageBudgetStatus, type UsageBudgetStatus } from "./usage-budget-service";
import { deriveLatestMetrics } from "./usage-metrics";

export { deriveLatestMetrics };

export type UsageOverviewResponse = {
  latest: {
    requests: number;
    errors: number;
    errorRate: number;
    p95Ms: number;
    dbStorageMb: number;
    taskCount: number;
    attachmentBytes: number;
    spendMtdCents: number;
    source: string;
  };
  series: Array<Record<string, unknown>>;
  provider: Awaited<ReturnType<typeof getProviderMtdSummary>>;
  attribution: ReturnType<typeof getAttributionForUsage>;
  budget: UsageBudgetStatus;
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

  const perf = await getApiPerformanceHeuristics({ windowHours: 24, maxEvents: 10_000 });
  const totalRequests = perf.routes.reduce((sum, r) => sum + r.count, 0);
  const totalErrors = perf.routes.reduce((sum, r) => sum + r.serverErrorCount, 0);
  const p95Values = perf.routes.map((r) => r.p95Ms).filter((v) => v > 0);
  const p95Ms = p95Values.length > 0 ? Math.max(...p95Values) : 0;

  const spendMtdCents = await deriveSpendMtdCents();
  const attribution = getAttributionForUsage();

  await saveUsageSnapshot({
    snapshotDate: today,
    source: spendMtdCents > 0 ? "mixed" : "internal_derived",
    requests: totalRequests || 0,
    errors: totalErrors,
    p95Ms,
    dbStorageMb,
    taskCount: storage.taskCount,
    attachmentBytes: storage.attachmentBytes,
    spendMtdCents,
    attributionJson: attribution,
  });
}

export async function getUsageOverview(): Promise<UsageOverviewResponse> {
  const { getUsageSnapshots } = await import("../storage");
  const series = await getUsageSnapshots(60);
  const row = series[0];
  const provider = await getProviderMtdSummary("neon");
  const budget = await getUsageBudgetStatus();
  const attribution = getAttributionForUsage();

  const internalLatest = deriveLatestMetrics(row);
  const spendMtdCents =
    provider.dataQuality === "provider_reported" ? provider.totalCostCents : internalLatest.spendMtdCents;

  if (isProviderDataStale(provider.lastImportAt)) {
    attribution.opsWarnings = [
      ...attribution.opsWarnings,
      "Provider billing import is stale — paste Neon bill JSON on this tab.",
    ];
  }
  if (attribution.readyChecks > 0 && attribution.healthChecks > 0) {
    const readyRatio = attribution.readyChecks / (attribution.healthChecks + attribution.readyChecks);
    if (readyRatio > 0.2) {
      attribution.opsWarnings.push(
        `/ready checks are ${Math.round(readyRatio * 100)}% of health traffic — verify Render uses /health only.`,
      );
    }
  }

  return {
    latest: {
      ...internalLatest,
      spendMtdCents,
      source: row?.source ?? (provider.dataQuality === "provider_reported" ? "mixed" : "internal_derived"),
    },
    series,
    provider,
    attribution,
    budget,
  };
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
