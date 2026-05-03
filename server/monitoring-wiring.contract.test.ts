// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("monitoring wiring", () => {
  it("attaches request context middleware for /api", () => {
    const src = fs.readFileSync(path.join(root, "server", "index.ts"), "utf8");
    expect(src).toContain('app.use("/api", attachMonitorContext())');
    const ctxSrc = fs.readFileSync(path.join(root, "server", "monitoring", "request-context.ts"), "utf8");
    expect(ctxSrc).toContain('res.setHeader("x-request-id"');
  });

  it("records api_error and notifies admins", () => {
    const indexSrc = fs.readFileSync(path.join(root, "server", "index.ts"), "utf8");
    const routesSrc = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(indexSrc).toContain('eventType: "api_error"');
    expect(indexSrc).toContain("notifyAdminsOfApiError");
    expect(routesSrc).toContain('eventType: "api_error"');
    expect(routesSrc).toContain("notifyAdminsOfApiError");
  });
});

