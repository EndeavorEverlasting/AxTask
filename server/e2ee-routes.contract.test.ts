// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routesPath = path.join(projectRoot, "server", "routes.ts");

describe("E2EE + DM routes", () => {
  it("registers device and DM API paths", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('app.post("/api/e2ee/devices"');
    expect(routes).toContain('app.get("/api/e2ee/devices"');
    expect(routes).toContain('app.get("/api/e2ee/conversations/:id/peer-devices"');
    expect(routes).toContain('app.get("/api/dm/public-identity"');
    expect(routes).toContain('app.post("/api/dm/conversations"');
    expect(routes).toContain('app.get("/api/dm/conversations"');
    expect(routes).toContain('app.get("/api/dm/conversations/:id/messages"');
    expect(routes).toContain('app.post("/api/dm/conversations/:id/messages"');
  });
});
