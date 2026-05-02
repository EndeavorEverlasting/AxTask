// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routeSources = [
  path.join(projectRoot, "server", "routes.ts"),
  path.join(projectRoot, "server", "routes", "dm-e2ee.ts"),
]
  .map((filePath) => fs.readFileSync(filePath, "utf8"))
  .join("\n\n");

describe("E2EE + DM routes", () => {
  it("registers device and DM API paths", () => {
    expect(routeSources).toContain('app.post("/api/e2ee/devices"');
    expect(routeSources).toContain('app.get("/api/e2ee/devices"');
    expect(routeSources).toContain('app.get("/api/e2ee/conversations/:id/peer-devices"');
    expect(routeSources).toContain('app.get("/api/dm/public-identity"');
    expect(routeSources).toContain('app.post("/api/dm/conversations"');
    expect(routeSources).toContain('app.get("/api/dm/conversations"');
    expect(routeSources).toContain('app.get("/api/dm/conversations/:id/messages"');
    expect(routeSources).toContain('app.post("/api/dm/conversations/:id/messages"');
  });
});
