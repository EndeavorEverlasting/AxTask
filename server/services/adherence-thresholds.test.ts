// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getAdherenceThresholds } from "./adherence-thresholds";

describe("adherence thresholds", () => {
  it("uses sane defaults", () => {
    const t = getAdherenceThresholds();
    expect(t.missedDueMinutes).toBeGreaterThan(0);
    expect(t.noEngagementDays).toBeGreaterThan(0);
    expect(t.signalCooldownHours).toBeGreaterThan(0);
  });
});

