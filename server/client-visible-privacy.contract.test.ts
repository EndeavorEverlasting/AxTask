// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("client-visible privacy wiring", () => {
  it("serializes session and wallet for main API responses", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain("toPublicSessionUser");
    expect(routes).toContain("toPublicWallet");
    expect(routes).toContain("toPublicCoinTransactions");
    expect(routes).toContain("toPublicSessionUser(fresh)");
  });

  it("does not log full API JSON bodies in request access middleware", () => {
    const idx = fs.readFileSync(path.join(root, "server", "index.ts"), "utf8");
    expect(idx).not.toMatch(/JSON\.stringify\(capturedJsonResponse\)/);
    expect(idx).not.toContain("capturedJsonResponse");
  });
});
