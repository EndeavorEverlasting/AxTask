import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Source-level contract for GET /api/admin/db-size.
 *
 * Keeps the guard chain and wiring stable across refactors — the point
 * of this endpoint is to mirror the deploy-time capacity gate, and we
 * don't want someone to accidentally remove the admin step-up and ship
 * a raw pg_database_size() query to the public API.
 */

const SRC = fs.readFileSync(path.resolve(__dirname, "routes.ts"), "utf8");

describe("GET /api/admin/db-size contract", () => {
  it("imports getDbSizeCached from ./services/db-size", () => {
    expect(SRC).toMatch(/import\s*\{\s*getDbSizeCached\s*\}\s*from\s*["']\.\/services\/db-size["']/);
  });

  it("is behind requireAdmin AND requireAdminStepUp", () => {
    const marker = 'app.get("/api/admin/db-size"';
    expect(SRC).toContain(marker);
    const idx = SRC.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const line = SRC.slice(idx, idx + 200);
    expect(line).toContain("requireAdmin,");
    expect(line).toContain("requireAdminStepUp,");
  });

  it("handles errors with a 500 + non-leaky message (no raw DB strings)", () => {
    const marker = 'app.get("/api/admin/db-size"';
    const idx = SRC.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const endpoint = SRC.slice(idx, idx + 600);
    expect(endpoint).toMatch(/res\.status\(500\)/);
    expect(endpoint).toMatch(/Failed to read database size/);
    // Critical: never surface raw pg_database_size SQL or connection
    // strings to API callers.
    expect(endpoint).not.toMatch(/pg_database_size/);
    expect(endpoint).not.toMatch(/DATABASE_URL/);
  });
});

describe("retention prune scheduler is wired to server startup", () => {
  const INDEX_SRC = fs.readFileSync(path.resolve(__dirname, "index.ts"), "utf8");

  it("imports startRetentionPruneTicker", () => {
    expect(INDEX_SRC).toMatch(/import\s*\{\s*startRetentionPruneTicker\s*\}/);
  });

  it("starts the ticker outside of tests (so the suite stays hermetic)", () => {
    expect(INDEX_SRC).toMatch(/process\.env\.NODE_ENV !== "test"/);
    expect(INDEX_SRC).toMatch(/DISABLE_RETENTION_PRUNE/);
    expect(INDEX_SRC).toMatch(/startRetentionPruneTicker\(/);
  });
});
