// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const routeSources = [
  "server/routes.ts",
  "server/routes/account.ts",
  "server/routes/auth.ts",
]
  .map((rel) => fs.readFileSync(path.join(root, rel), "utf8"))
  .join("\n\n");

describe("client-visible privacy wiring", () => {
  it("serializes session and wallet for main API responses", () => {
    expect(routeSources).toContain("toPublicSessionUser");
    expect(routeSources).toContain("toPublicWallet");
    expect(routeSources).toContain("toPublicCoinTransactions");
    expect(routeSources).toContain("toPublicSessionUser(fresh)");
  });

  it("does not log full API JSON bodies in request access middleware", () => {
    const idx = fs.readFileSync(path.join(root, "server", "index.ts"), "utf8");
    expect(idx).not.toMatch(/JSON\.stringify\(capturedJsonResponse\)/);
    expect(idx).not.toContain("capturedJsonResponse");
  });
});
