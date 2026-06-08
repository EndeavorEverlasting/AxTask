// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_SRC = fs.readFileSync(path.join(__dirname, "index.ts"), "utf8");
const ROUTES_SRC = fs.readFileSync(path.join(__dirname, "routes.ts"), "utf8");
const PROD_START = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "production-start.mjs"),
  "utf8",
);
const RENDER_YAML = fs.readFileSync(path.join(__dirname, "..", "render.yaml"), "utf8");

describe("scheduled resource controls (server startup)", () => {
  it("gates reminder dispatch with DISABLE_REMINDER_DISPATCH", () => {
    expect(INDEX_SRC).toMatch(/DISABLE_REMINDER_DISPATCH/);
    expect(INDEX_SRC).toContain("[reminders] dispatch disabled (DISABLE_REMINDER_DISPATCH=true)");
  });

  it("gates archetype rollup with DISABLE_ARCHETYPE_ROLLUP", () => {
    expect(INDEX_SRC).toMatch(/DISABLE_ARCHETYPE_ROLLUP/);
    expect(INDEX_SRC).toContain("[archetype-rollup] disabled (DISABLE_ARCHETYPE_ROLLUP=true)");
  });

  it("decouples DB-size snapshot from retention prune via DISABLE_DB_SIZE_SNAPSHOT", () => {
    expect(INDEX_SRC).toMatch(/DISABLE_DB_SIZE_SNAPSHOT/);
    expect(INDEX_SRC).toMatch(/dbSizeSnapshotEnabled/);
    expect(INDEX_SRC).toContain("[db-size-snapshot] disabled (DISABLE_DB_SIZE_SNAPSHOT=true)");
  });

  it("logs when in-process retention prune is disabled", () => {
    expect(INDEX_SRC).toContain("[retention-prune] disabled (DISABLE_RETENTION_PRUNE=true)");
  });

  it("keeps backup workers opt-in (=== true)", () => {
    expect(INDEX_SRC).toMatch(/BACKUP_SCHEDULER_ENABLED === "true"/);
    expect(INDEX_SRC).toMatch(/BACKUP_QUEUE_WORKER_ENABLED === "true"/);
    expect(INDEX_SRC).toMatch(/BACKUP_BULLMQ_ENABLED === "true"/);
  });

  it("does not reintroduce Drizzle push in production-start", () => {
    expect(PROD_START).toMatch(/SKIP_DB_PUSH_ON_START/);
    expect(PROD_START).not.toMatch(/db:push.*production/i);
  });

  it("keeps /health DB-free", () => {
    const healthBlock = INDEX_SRC.match(
      /app\.get\(\s*["']\/health["'][\s\S]{0,500}?\}\s*\)/,
    )?.[0];
    expect(healthBlock).toBeTruthy();
    expect(healthBlock).not.toMatch(/pool\.query|SELECT 1/i);
  });
});

describe("scheduled resource controls (admin usage capture)", () => {
  it("gates POST /api/admin/usage/capture with DISABLE_OPS_SNAPSHOT", () => {
    const marker = 'app.post("/api/admin/usage/capture"';
    const idx = ROUTES_SRC.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const block = ROUTES_SRC.slice(idx, idx + 500);
    expect(block).toContain("DISABLE_OPS_SNAPSHOT");
    expect(block).toContain("Usage snapshot capture disabled (DISABLE_OPS_SNAPSHOT=true)");
  });
});

describe("scheduled resource controls (render.yaml production disables)", () => {
  it("sets production disable flags for scheduled workers", () => {
    expect(RENDER_YAML).toMatch(/DISABLE_REMINDER_DISPATCH[\s\S]*value:\s*"true"/);
    expect(RENDER_YAML).toMatch(/DISABLE_ARCHETYPE_ROLLUP[\s\S]*value:\s*"true"/);
    expect(RENDER_YAML).toMatch(/DISABLE_DB_SIZE_SNAPSHOT[\s\S]*value:\s*"true"/);
    expect(RENDER_YAML).toMatch(/DISABLE_OPS_SNAPSHOT[\s\S]*value:\s*"true"/);
  });
});
