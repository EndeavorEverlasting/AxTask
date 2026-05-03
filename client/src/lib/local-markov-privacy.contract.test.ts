import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("local-markov privacy contract", () => {
  it("local-markov-predictions never POSTs completion ledger payloads", () => {
    const src = readFileSync(join(__dirname, "local-markov-predictions.ts"), "utf8");
    expect(src).toContain("GET");
    expect(src).toContain("/api/location-places");
    expect(src).not.toMatch(/apiRequest\s*\(\s*["']POST["']/);
  });

  it("ledger module never calls apiRequest", () => {
    const src = readFileSync(join(__dirname, "local-prediction-ledger.ts"), "utf8");
    expect(src).not.toContain("apiRequest");
    expect(src).not.toContain("fetch(");
  });
});
