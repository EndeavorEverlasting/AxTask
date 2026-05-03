// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classificationAssociationsSchema } from "./schema";

describe("classificationAssociationsSchema", () => {
  it("accepts ordered multi-label rows", () => {
    const parsed = classificationAssociationsSchema.parse([
      { label: "Finance", confidence: 0.6 },
      { label: "Support", confidence: 0.4 },
    ]);
    expect(parsed).toHaveLength(2);
  });

  it("rejects more than eight labels", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      label: `L${i}`,
      confidence: 1 / 9,
    }));
    expect(() => classificationAssociationsSchema.parse(rows)).toThrow();
  });
});
