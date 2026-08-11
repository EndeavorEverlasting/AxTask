/**
 * Contract: server/index.ts mounts DB-free /health liveness and DB-backed /ready
 * readiness, while render.yaml uses /health for the platform probe.
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
  const dbRuntimeSrc = fs.readFileSync(
    path.join(repoRoot, "server", "db-runtime.ts"),
    "utf8",
  );

  it("mounts GET /health", () => {
    expect(indexSrc).toMatch(/app\.get\(\s*["']\/health["']/);
  });

  it("mounts GET /ready", () => {
    expect(indexSrc).toMatch(/app\.get\(\s*["']\/ready["']/);
  });

  it("/ready delegates to the cheap DB probe and the probe does SELECT 1", () => {
    expect(indexSrc).toMatch(/\/ready[\s\S]{0,800}probeDatabase\(pool\)/i);
    expect(dbRuntimeSrc).toMatch(/pool\.query\(["']SELECT 1["']\)/i);
  });

  it("/ready exposes only coarse DB failure diagnostics", () => {
    const readyBlock = indexSrc.match(
      /app\.get\(\s*["']\/ready["'][\s\S]{0,2400}?\n\}\);/,
    )?.[0] ?? "";
    expect(readyBlock).toContain("errorClass");
    expect(readyBlock).toContain("retryable");
    expect(readyBlock).toContain("Retry-After");
    expect(readyBlock).not.toMatch(/DATABASE_URL|connectionString|password/i);
  });

  it("/health does NOT touch the DB (cheap liveness)", () => {
    const healthBlockMatch = indexSrc.match(
      /app\.get\(\s*["']\/health["'][\s\S]{0,500}?\}\s*\)/,
    );
    expect(healthBlockMatch).toBeTruthy();
    const healthBody = healthBlockMatch?.[0] ?? "";
    expect(healthBody).not.toMatch(/SELECT/i);
    expect(healthBody).not.toMatch(/pool\.query/i);
    expect(healthBody).not.toMatch(/probeDatabase/i);
  });

  it("classifies runtime DB errors before building the API error response", () => {
    expect(indexSrc).toMatch(/const dbFailure = classifyDbRuntimeError\(err\)/);
    expect(indexSrc).toMatch(/dbFailure && rawStatus >= 500 \? 503 : rawStatus/);
    expect(indexSrc).toMatch(/errorClass:\s*dbFailure\.errorClass/);
    expect(indexSrc).toMatch(/requestId:\s*ctx\?\.requestId/);
  });

  it("does not recursively append DB incidents to security_events", () => {
    expect(indexSrc).toMatch(
      /if \(dbFailure\)[\s\S]{0,1200}else \{[\s\S]{0,500}appendSecurityEvent\(/,
    );
    expect(indexSrc).toMatch(/appendSecurityEvent\([\s\S]{0,1200}\.catch\(/);
  });
});

describe("[06-health] render.yaml health config", () => {
  const renderYaml = fs.readFileSync(
    path.join(repoRoot, "render.yaml"),
    "utf8",
  );

  it("uses DB-free /health for Render liveness", () => {
    expect(renderYaml).toMatch(/healthCheckPath:\s*\/health/);
    expect(renderYaml).not.toMatch(/healthCheckPath:\s*\/ready/);
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
