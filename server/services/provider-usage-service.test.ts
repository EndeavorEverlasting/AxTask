// @vitest-environment node
import { describe, expect, it } from "vitest";
import { neonBillingImportSchema } from "./provider-usage-import-schema";
import { deriveLatestMetrics } from "./usage-metrics";

describe("provider-usage-service", () => {
  it("validates neon billing import payload", () => {
    const parsed = neonBillingImportSchema.parse({
      periodStart: "2026-06-01",
      periodEnd: "2026-07-01",
      computeHours: 299.72,
      computeCostCents: 3177,
      storageGbMonth: 38.89,
      storageCostCents: 284,
      historyGb: 124.35,
      historyCostCents: 293,
      transferGb: 45.03,
      transferCostCents: 0,
    });
    expect(parsed.computeHours).toBe(299.72);
  });
});

describe("usage-service deriveLatestMetrics", () => {
  it("includes source label", () => {
    const m = deriveLatestMetrics({
      source: "internal_derived",
      requests: 10,
      errors: 1,
      p95Ms: 200,
      dbStorageMb: 50,
      taskCount: 5,
      attachmentBytes: 1000,
      spendMtdCents: 3200,
    });
    expect(m.source).toBe("internal_derived");
    expect(m.spendMtdCents).toBe(3200);
  });
});
