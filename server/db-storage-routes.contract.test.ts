// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the Admin > Storage route wiring. We don't stand up a full
 * Express app in this repo's unit tests (the auth middleware takes a
 * live session), so we static-analyze server/routes.ts the same way
 * server/adherence-routes.contract.test.ts does.
 */
const routesSrc = fs.readFileSync(
  path.resolve(__dirname, "routes.ts"),
  "utf8",
);

describe("Admin > Storage routes", () => {
  it("registers the six new /api/admin/db-storage + retention endpoints", () => {
    expect(routesSrc).toContain('app.get("/api/admin/db-storage/tables"');
    expect(routesSrc).toContain('app.get("/api/admin/db-storage/domains"');
    expect(routesSrc).toContain('app.get("/api/admin/db-storage/top-users"');
    expect(routesSrc).toContain('app.get("/api/admin/db-size/history"');
    expect(routesSrc).toContain('app.get("/api/admin/retention/preview"');
    // app.post(...) is multi-line; match with regex that ignores whitespace.
    expect(routesSrc).toMatch(/app\.post\(\s*"\/api\/admin\/retention\/run"/);
  });

  it("every new storage route goes through requireAdmin + requireAdminStepUp", () => {
    const routes = [
      "/api/admin/db-storage/tables",
      "/api/admin/db-storage/domains",
      "/api/admin/db-storage/top-users",
      "/api/admin/db-size/history",
      "/api/admin/retention/preview",
      "/api/admin/retention/run",
    ];
    for (const r of routes) {
      const idx = routesSrc.indexOf(`"${r}"`);
      expect(idx, `route ${r} not found`).toBeGreaterThan(-1);
      // Look at the ~400 chars after the route string (spans multi-line
      // registrations like the POST run).
      const window = routesSrc.slice(idx, idx + 500);
      expect(window, `route ${r} missing requireAdmin`).toContain("requireAdmin");
      expect(window, `route ${r} missing requireAdminStepUp`).toContain("requireAdminStepUp");
    }
  });

  it("POST /api/admin/retention/run is rate-limited via adminRetentionRunLimiter", () => {
    // The limiter sits in front of the role/step-up middleware because
    // mutation bursts shouldn't even reach those checks.
    const idx = routesSrc.indexOf('"/api/admin/retention/run"');
    expect(idx).toBeGreaterThan(-1);
    const block = routesSrc.slice(idx, idx + 500);
    expect(block).toContain("adminRetentionRunLimiter");
  });

  it("POST /api/admin/retention/run audits via logSecurityEvent('retention_prune_manual')", () => {
    const idx = routesSrc.indexOf('"/api/admin/retention/run"');
    const block = routesSrc.slice(idx, idx + 2500);
    expect(block).toMatch(/logSecurityEvent\(\s*"retention_prune_manual"/);
  });

  it("adminRetentionRunLimiter is defined with a sane window (<=60s) and max (<=10)", () => {
    const limiterIdx = routesSrc.indexOf("const adminRetentionRunLimiter");
    expect(limiterIdx).toBeGreaterThan(-1);
    const block = routesSrc.slice(limiterIdx, limiterIdx + 400);
    // windowMs: 60 * 1000 or 60_000 accepted.
    expect(/windowMs:\s*60\s*\*\s*1000|windowMs:\s*60_000|windowMs:\s*60000/.test(block)).toBe(true);
    const maxMatch = block.match(/max:\s*(\d+)/);
    expect(maxMatch).not.toBeNull();
    expect(Number(maxMatch![1])).toBeLessThanOrEqual(10);
  });
});
