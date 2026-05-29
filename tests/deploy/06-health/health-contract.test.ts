/**
 * Contract: server/index.ts mounts /health and /ready as Render expects
 * (render.yaml sets healthCheckPath: /health).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("[06-health] server health endpoints", () => {
  const indexSrc = fs.readFileSync(
    path.join(repoRoot, "server", "index.ts"),
    "utf8",
  );

  it("mounts GET /health", () => {
    expect(indexSrc).toMatch(/app\.get\(\s*["']\/health["']/);
  });

  it("mounts GET /ready", () => {
    expect(indexSrc).toMatch(/app\.get\(\s*["']\/ready["']/);
  });

  it("mounts GET /ops/status with bearer token gate", () => {
    expect(indexSrc).toMatch(/app\.get\(\s*["']\/ops\/status["']/);
    expect(indexSrc).toMatch(/OPS_STATUS_TOKEN/);
  });

  it("/health includes uptimeSeconds and does NOT touch the DB", () => {
    const healthBlockMatch = indexSrc.match(
      /app\.get\(\s*["']\/health["'][\s\S]{0,600}?\}\s*\)/,
    );
    expect(healthBlockMatch).toBeTruthy();
    const healthBody = healthBlockMatch?.[0] ?? "";
    expect(healthBody).toMatch(/uptimeSeconds/);
    expect(healthBody).not.toMatch(/SELECT/i);
    expect(healthBody).not.toMatch(/pool\.query/i);
  });

  it("/ready does a DB ping (SELECT 1)", () => {
    expect(indexSrc).toMatch(/\/ready[\s\S]{0,800}SELECT 1/i);
  });
});

describe("[06-health] render.yaml health config", () => {
  const renderYaml = fs.readFileSync(
    path.join(repoRoot, "render.yaml"),
    "utf8",
  );

  it("healthCheckPath is /health (cheap liveness, no DB)", () => {
    expect(renderYaml).toMatch(/healthCheckPath:\s*\/health/);
  });

  it("autoDeploy is explicitly set (true or false) — no silent default", () => {
    expect(renderYaml).toMatch(/autoDeploy:\s*(true|false)/);
  });

  it("if autoDeploy is true, the capacity gate must be wired to run before migrations", () => {
    const autoOn = /autoDeploy:\s*true/.test(renderYaml);
    if (!autoOn) return;
    const startScript = fs.readFileSync(
      path.join(repoRoot, "scripts", "production-start.mjs"),
      "utf8",
    );
    expect(startScript).toMatch(/check-db-capacity\.mjs/);
  });
});
