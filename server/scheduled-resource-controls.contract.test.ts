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

function renderEnvValue(key: string): string | undefined {
  const lines = RENDER_YAML.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => line.trim() === `- key: ${key}`);
  if (keyIndex === -1) return undefined;

  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*-\s+key:/.test(line)) break;

    const valueMatch = line.match(/^\s*value:\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/);
    if (valueMatch) return valueMatch[1];
  }

  return undefined;
}

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
    const healthStart = INDEX_SRC.indexOf('app.get("/health"');
    const readyStart = INDEX_SRC.indexOf('app.get("/ready"', healthStart);

    expect(healthStart, "/health route registration not found").toBeGreaterThan(-1);
    expect(readyStart, "/ready route must follow /health").toBeGreaterThan(healthStart);

    const healthBlock = INDEX_SRC.slice(healthStart, readyStart);
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
  it("sets each production disable flag to true in its own env block", () => {
    for (const key of [
      "DISABLE_REMINDER_DISPATCH",
      "DISABLE_ARCHETYPE_ROLLUP",
      "DISABLE_DB_SIZE_SNAPSHOT",
      "DISABLE_OPS_SNAPSHOT",
    ]) {
      expect(renderEnvValue(key), `${key} must be explicitly true`).toBe("true");
    }
  });
});
