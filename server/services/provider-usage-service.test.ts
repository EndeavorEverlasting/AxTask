// @vitest-environment node
import { describe, expect, it } from "vitest";
import { neonBillingImportSchema } from "./provider-usage-import-schema";
import { deriveLatestMetrics } from "./usage-metrics";
import { matchesMtdMonth } from "./provider-usage-mtd";

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

  it("rejects invalid calendar dates", () => {
    expect(() =>
      neonBillingImportSchema.parse({
        periodStart: "2026-02-30",
        periodEnd: "2026-03-01",
        computeHours: 1,
        computeCostCents: 1,
        storageGbMonth: 1,
        storageCostCents: 1,
        historyGb: 1,
        historyCostCents: 1,
        transferGb: 1,
        transferCostCents: 0,
      }),
    ).toThrow();
  });

  it("rejects reversed period ranges", () => {
    expect(() =>
      neonBillingImportSchema.parse({
        periodStart: "2026-07-01",
        periodEnd: "2026-06-01",
        computeHours: 1,
        computeCostCents: 1,
        storageGbMonth: 1,
        storageCostCents: 1,
        historyGb: 1,
        historyCostCents: 1,
        transferGb: 1,
        transferCostCents: 0,
      }),
    ).toThrow();
  });
});

describe("matchesMtdMonth", () => {
  const juneStart = "2026-06-01";
  const juneEnd = "2026-06-30";
  const julyStart = "2026-07-01";
  const julyEnd = "2026-07-31";

  it("counts exclusive-end June bill in June only", () => {
    const periodStart = "2026-06-01";
    const periodEnd = "2026-07-01";
    expect(matchesMtdMonth(periodStart, periodEnd, juneStart, juneEnd)).toBe(true);
    expect(matchesMtdMonth(periodStart, periodEnd, julyStart, julyEnd)).toBe(false);
  });

  it("excludes period ending exactly on month start", () => {
    expect(matchesMtdMonth("2026-05-01", "2026-06-01", juneStart, juneEnd)).toBe(false);
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
