// @vitest-environment node
import { describe, expect, it } from "vitest";
import { processFeedbackWithEngines } from "./feedback-engine";

describe("feedback-engine", () => {
  it("extracts analysis signals from feedback", async () => {
    const result = await processFeedbackWithEngines(
      "The login page is broken and users cannot sign in",
      2,
    );

    expect(result.priority).toMatch(/high|critical|medium|low/);
    expect(result.classification.length).toBeGreaterThan(0);
    expect(result.tags.length).toBeGreaterThan(0);
    expect(result.classifier.fallbackLayer).toBeGreaterThanOrEqual(1);
  });

  it("returns actions for feature request style feedback", async () => {
    const result = await processFeedbackWithEngines(
      "Feature request: add a better calendar view and mobile layout",
      0,
    );

    expect(result.recommendedActions.length).toBeGreaterThan(0);
  });
});
