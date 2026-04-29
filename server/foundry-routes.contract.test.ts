// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const foundryRoutesPath = path.join(projectRoot, "server", "routes", "foundry.ts");

describe("Admin Foundry routes contract", () => {
  it("registers GET status, GET runs, POST runs behind admin + Foundry gate helpers", () => {
    const src = fs.readFileSync(foundryRoutesPath, "utf8");
    expect(src).toContain('"/api/admin/foundry/status"');
    expect(src).toContain('"/api/admin/foundry/runs"');
    expect(src).toContain("deps.requireAdmin");
    expect(src).toContain("deps.requireAdminStepUp");
    expect(src).toContain("requireFoundryEnabled");
    expect(src).toContain("ENABLE_FOUNDRY");
  });
});
