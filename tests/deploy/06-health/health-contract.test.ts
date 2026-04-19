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

  it("autoDeploy is explicitly set (true or false) — no silent default", () => {
    // We don't pin the value: manual-promote (false) and push-to-ship
    // (true) are both valid postures. What matters is that the posture
    // is declared in render.yaml and reviewable in PRs — a missing key
    // means Render falls back to its own default, which is invisible
    // to the deploy-test suite.
    expect(renderYaml).toMatch(/autoDeploy:\s*(true|false)/);
  });

  it("if autoDeploy is true, the capacity gate must be wired to run before migrations", () => {
    // autoDeploy=true means every push to main ships. The only thing
    // between `git push origin main` and a live migration is the
    // capacity gate (Phase J) — it has to be present in the start path.
    const autoOn = /autoDeploy:\s*true/.test(renderYaml);
    if (!autoOn) return;
    const startScript = fs.readFileSync(
      path.join(repoRoot, "scripts", "production-start.mjs"),
      "utf8",
    );
    expect(startScript).toMatch(/check-db-capacity\.mjs/);
  });
});
