// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routesPath = path.join(projectRoot, "server", "routes.ts");

describe("account import route contracts", () => {
  it("uses a shared full-user-bundle predicate for challenge and import handlers", () => {
    const routes = fs.readFileSync(routesPath, "utf8");

    expect(routes).toContain("const isFullUserBundle = (bundle: unknown)");
    expect(routes).toContain("if (isFullUserBundle(req.body?.bundle))");
    expect(routes).toContain("if (isFullUserBundle(body.bundle))");
  });

  it("defines full-user-bundle detection with symmetric data field checks", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    const helperStart = routes.indexOf("const isFullUserBundle = (bundle: unknown)");
    const helperEnd = routes.indexOf('app.post("/api/account/import/challenge"');

    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);

    const helperBlock = routes.slice(helperStart, helperEnd);
    expect(helperBlock).toContain('metadata.exportMode === "user"');
    expect(helperBlock).toContain("Array.isArray(data.tasks)");
    expect(helperBlock).toContain("Array.isArray(data.userBadges)");
    expect(helperBlock).toContain("Array.isArray(data.coinTransactions)");
  });
});
