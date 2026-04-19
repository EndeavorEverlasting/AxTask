/**
 * Contract: server/index.ts mounts /health and /ready as Render expects
 * (render.yaml sets healthCheckPath: /ready).
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

  it("/ready does a DB ping (SELECT 1)", () => {
    expect(indexSrc).toMatch(/\/ready[\s\S]{0,800}SELECT 1/i);
  });

  it("/health does NOT touch the DB (cheap liveness)", () => {
    const healthBlockMatch = indexSrc.match(
      /app\.get\(\s*["']\/health["'][\s\S]{0,500}?\}\s*\)/,
    );
    expect(healthBlockMatch).toBeTruthy();
    const healthBody = healthBlockMatch?.[0] ?? "";
    expect(healthBody).not.toMatch(/SELECT/i);
    expect(healthBody).not.toMatch(/pool\.query/i);
  });
});

describe("[06-health] render.yaml health config", () => {
  const renderYaml = fs.readFileSync(
    path.join(repoRoot, "render.yaml"),
    "utf8",
  );

  it("healthCheckPath is /ready", () => {
    expect(renderYaml).toMatch(/healthCheckPath:\s*\/ready/);
  });

  it("autoDeploy is false (so a push to main does not ship to prod)", () => {
    expect(renderYaml).toMatch(/autoDeploy:\s*false/);
  });
});
