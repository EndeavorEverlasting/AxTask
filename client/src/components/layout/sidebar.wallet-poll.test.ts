// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "sidebar.tsx"), "utf8");

describe("Sidebar wallet polling contract", () => {
  it("does not poll wallet on a 30s interval (idle tab DB load)", () => {
    expect(SRC).not.toMatch(/refetchInterval:\s*30_?000/);
  });

  it("disables background interval refetch explicitly", () => {
    expect(SRC).toContain("refetchIntervalInBackground: false");
  });

  it("relies on mutation invalidation and default staleTime for wallet freshness", () => {
    expect(SRC).toContain('queryKey: ["/api/gamification/wallet"]');
    expect(SRC).toMatch(/refetchInterval:\s*false/);
  });
});
