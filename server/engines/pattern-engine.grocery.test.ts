// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..");

describe("pattern engine grocery contracts", () => {
  const source = fs.readFileSync(path.join(root, "server", "engines", "pattern-engine.ts"), "utf8");

  it("exports inferGroceryRepurchaseSuggestions", () => {
    expect(source).toMatch(/export function inferGroceryRepurchaseSuggestions/);
  });

  it("blends purchase history with recurrence patterns", () => {
    expect(source).toContain("purchaseEvents");
    expect(source).toContain("recurrencePatterns");
    expect(source).toContain('source = "blended"');
  });

  it("contains confidence gating and near-term filtering safeguards", () => {
    expect(source).toContain("if (daysUntil > 7) continue;");
    expect(source).toContain("if (confidence < 52) continue;");
  });
});
