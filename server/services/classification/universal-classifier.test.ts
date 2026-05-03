// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyWithFallback } from "./universal-classifier";

describe("universal-classifier", () => {
  it("uses local fallback layers when external API is not configured", async () => {
    const result = await classifyWithFallback("fix login issue", "users cannot sign in", {
      preferExternal: true,
    });

    expect(result.classification.length).toBeGreaterThan(0);
    expect(result.fallbackLayer).toBeGreaterThanOrEqual(1);
    expect(["priority_engine", "keyword_fallback"]).toContain(result.source);
  });

  it("supports local-only mode", async () => {
    const result = await classifyWithFallback("invoice reconciliation", "", {
      preferExternal: false,
    });

    expect(result.fallbackLayer).toBeGreaterThanOrEqual(1);
    expect(result.source).not.toBe("external_api");
  });
});
