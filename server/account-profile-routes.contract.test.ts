// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routesPath = path.join(projectRoot, "server", "routes.ts");

describe("account profile routes", () => {
  it("registers GET and PATCH /api/account/profile for owner display name and birthday", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('app.get("/api/account/profile"');
    expect(routes).toContain('app.patch("/api/account/profile"');
    expect(routes).toContain("updateUserAccountProfile");
    expect(routes).toContain("isIsoCalendarDateStrict");
  });
});
