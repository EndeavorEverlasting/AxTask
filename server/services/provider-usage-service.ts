import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { providerUsageSnapshots } from "@shared/schema";
import { randomUUID } from "crypto";
import {
  neonBillingImportSchema,
  type NeonBillingImport,
} from "./provider-usage-import-schema";

export { neonBillingImportSchema, type NeonBillingImport };

export type ProviderMtdSummary = {
  computeCostCents: number;
  storageCostCents: number;
  historyCostCents: number;
  transferCostCents: number;
  totalCostCents: number;
  computeHours: number;
  lastImportAt: string | null;
  lastImportSource: string | null;
  dataQuality: "provider_reported" | "internal_estimate" | "mixed";
};

function monthBounds(now = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

const METRIC_ROWS: Array<{
  key: keyof NeonBillingImport;
  costKey: keyof NeonBillingImport;
  metricName: string;
  metricUnit: string;
}> = [
  { key: "computeHours", costKey: "computeCostCents", metricName: "compute_hours", metricUnit: "hours" },
  { key: "storageGbMonth", costKey: "storageCostCents", metricName: "storage_gb_month", metricUnit: "gb_month" },
  { key: "historyGb", costKey: "historyCostCents", metricName: "history_gb", metricUnit: "gb" },
  { key: "transferGb", costKey: "transferCostCents", metricName: "transfer_gb", metricUnit: "gb" },
];

export async function importNeonBillingPeriod(
  payload: NeonBillingImport,
  importedByUserId: string,
): Promise<{ imported: number; periodStart: string; periodEnd: string }> {
  const parsed = neonBillingImportSchema.parse(payload);
  const batchId = randomUUID();
  const rawJson = { ...parsed, importBatchId: batchId };

  for (const row of METRIC_ROWS) {
    await db.insert(providerUsageSnapshots).values({
      id: randomUUID(),
      provider: "neon",
      project: parsed.project ?? null,
      branch: parsed.branch ?? null,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      metricName: row.metricName,
      metricUnit: row.metricUnit,
      metricValue: Number(parsed[row.key]),
      costCents: Number(parsed[row.costKey]),
      source: "manual",
      rawJson,
      importedByUserId,
    });
  }

  return { imported: METRIC_ROWS.length, periodStart: parsed.periodStart, periodEnd: parsed.periodEnd };
}

export async function getProviderMtdSummary(provider = "neon"): Promise<ProviderMtdSummary> {
  const { start, end } = monthBounds();
  const rows = await db
    .select()
    .from(providerUsageSnapshots)
    .where(
      and(
        eq(providerUsageSnapshots.provider, provider),
        lte(providerUsageSnapshots.periodStart, end),
        gte(providerUsageSnapshots.periodEnd, start),
      ),
    )
    .orderBy(desc(providerUsageSnapshots.createdAt));

  if (rows.length === 0) {
    return {
      computeCostCents: 0,
      storageCostCents: 0,
      historyCostCents: 0,
      transferCostCents: 0,
      totalCostCents: 0,
      computeHours: 0,
      lastImportAt: null,
      lastImportSource: null,
      dataQuality: "internal_estimate",
    };
  }

  const latestImport = rows[0];
  const byMetric = new Map<string, typeof rows[0]>();
  for (const r of rows) {
    if (!byMetric.has(r.metricName)) byMetric.set(r.metricName, r);
  }

  const compute = byMetric.get("compute_hours");
  const storage = byMetric.get("storage_gb_month");
  const history = byMetric.get("history_gb");
  const transfer = byMetric.get("transfer_gb");

  const computeCostCents = compute?.costCents ?? 0;
  const storageCostCents = storage?.costCents ?? 0;
  const historyCostCents = history?.costCents ?? 0;
  const transferCostCents = transfer?.costCents ?? 0;

  return {
    computeCostCents,
    storageCostCents,
    historyCostCents,
    transferCostCents,
    totalCostCents: computeCostCents + storageCostCents + historyCostCents + transferCostCents,
    computeHours: compute?.metricValue ?? 0,
    lastImportAt: latestImport.createdAt?.toISOString() ?? null,
    lastImportSource: latestImport.source ?? null,
    dataQuality: "provider_reported",
  };
}

export async function deriveSpendMtdCents(): Promise<number> {
  const summary = await getProviderMtdSummary("neon");
  return summary.totalCostCents;
}

/** Latest import older than maxAgeDays triggers stale warning. */
export function isProviderDataStale(lastImportAt: string | null, maxAgeDays = 35): boolean {
  if (!lastImportAt) return true;
  const ageMs = Date.now() - new Date(lastImportAt).getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}
