import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateProgressiveDisclosure } from "../../scripts/ai-harness/validate-progressive-disclosure.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("progressive disclosure harness contract", () => {
  const result = validateProgressiveDisclosure(ROOT);

  it("keeps routing complete and fail-closed", () => {
    expect(result.errors).toEqual([]);
  });

  it("keeps the 50k orientation under the soft ceiling", () => {
    expect(result.measurements.orientation.estimatedTokens).toBeLessThanOrEqual(1000);
  });

  it("keeps every 30k domain isolated and under its additional ceiling", () => {
    const domains = Object.entries(result.measurements).filter(([key]) => key.startsWith("domain:"));
    expect(domains.length).toBeGreaterThan(0);
    for (const [, measurement] of domains) expect(measurement.estimatedTokens).toBeLessThanOrEqual(2000);
  });

  it("routes every 15k workflow bundle under its additional ceiling", () => {
    const workflows = Object.entries(result.measurements).filter(([key]) => key.startsWith("workflow:"));
    expect(workflows.length).toBeGreaterThan(0);
    for (const [, measurement] of workflows) expect(measurement.estimatedTokens).toBeLessThanOrEqual(4000);
  });
});
