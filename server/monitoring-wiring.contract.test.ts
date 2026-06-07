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

  it("emits structured request logs and ops snapshot wiring", () => {
    const src = fs.readFileSync(path.join(root, "server", "index.ts"), "utf8");
    expect(src).toContain("attachStructuredRequestLog");
    expect(src).toContain("emitBootEvent");
    expect(src).toContain("startOpsSnapshotTicker");
    expect(src).toContain('"/ops/status"');
    const loggerIdx = src.indexOf("attachStructuredRequestLog()");
    const healthIdx = src.indexOf('app.get("/health"');
    expect(loggerIdx).toBeGreaterThan(-1);
    expect(healthIdx).toBeGreaterThan(loggerIdx);
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

