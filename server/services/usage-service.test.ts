import { describe, expect, it } from "vitest";
import { deriveLatestMetrics } from "./usage-service";

describe("deriveLatestMetrics", () => {
  it("returns zero baseline for empty rows", () => {
    const metrics = deriveLatestMetrics(undefined);
    expect(metrics.requests).toBe(0);
    expect(metrics.errorRate).toBe(0);
  });

  it("computes error rate and normalized numbers", () => {
    const metrics = deriveLatestMetrics({
      requests: 100,
      errors: 7,
      p95Ms: 321,
      dbStorageMb: 42,
      taskCount: 15,
      attachmentBytes: 1024,
      spendMtdCents: 765,
    });
    expect(metrics.errorRate).toBe(7);
    expect(metrics.p95Ms).toBe(321);
    expect(metrics.dbStorageMb).toBe(42);
  });
});
