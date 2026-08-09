/**
 * Contract tests for deployment configuration changes:
 * - render.yaml no longer bakes in AXTASK_DB_SIZE_BUDGET_BYTES
 * - production-start.mjs includes recovery mode
 * - Capacity gate runs before migrations but recovery mode can bypass it
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("[13-deployment-config] render.yaml", () => {
  const renderYaml = fs.readFileSync(path.join(repoRoot, "render.yaml"), "utf8");

  it("does not bake in AXTASK_DB_SIZE_BUDGET_BYTES as a default", () => {
    // The budget should be commented out with clear operator guidance
    expect(renderYaml).toContain("# OPERATOR BUDGET (optional):");
    expect(renderYaml).toContain("#   Set AXTASK_DB_SIZE_BUDGET_BYTES to an explicit byte count");
    expect(renderYaml).toContain("#   When UNSET, the gate runs in REPORT-ONLY mode");
    expect(renderYaml).toContain("#   DO NOT bake a default here.");
  });

  it("has AXTASK_DB_SIZE_BUDGET_BYTES commented out with example", () => {
    expect(renderYaml).toContain("# - key: AXTASK_DB_SIZE_BUDGET_BYTES");
    expect(renderYaml).toContain('#     value: "10737418240"');
  });

  it("still has SKIP_DB_PUSH_ON_START=true", () => {
    expect(renderYaml).toContain("SKIP_DB_PUSH_ON_START");
    expect(renderYaml).toContain('value: "true"');
  });

  it("still has autoDeploy: true", () => {
    expect(renderYaml).toContain("autoDeploy: true");
  });

  it("uses /health for healthCheckPath", () => {
    expect(renderYaml).toContain("healthCheckPath: /health");
  });
});

describe("[13-deployment-config] production-start.mjs", () => {
  const src = fs.readFileSync(path.join(repoRoot, "scripts", "production-start.mjs"), "utf8");

  it("includes RECOVERY MODE with AXTASK_DB_RECOVERY_MODE", () => {
    expect(src).toContain("AXTASK_DB_RECOVERY_MODE");
    expect(src).toContain("recoveryMode");
    expect(src).toContain("RECOVERY MODE:");
  });

  it("recovery mode runs only containment migration and exits", () => {
    expect(src).toContain("Running containment migration ONLY");
    expect(src).toContain("server will NOT start");
    expect(src).toContain("process.exit(0)");
  });

  it("recovery mode skips capacity gate", () => {
    // In recovery mode, the capacity gate is skipped to allow containment migration
    expect(src).toContain("skip the capacity gate to allow the containment migration");
  });

  it("recovery mode provides next steps guidance", () => {
    expect(src).toContain("Next steps:");
    expect(src).toContain("db-reclaim-api-request.mjs");
    expect(src).toContain("check-db-capacity.mjs");
    expect(src).toContain("Resum");
  });

  it("normal mode still runs capacity gate before migrations", () => {
    // Strip comments to avoid false positives from the header docstring
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\*.*$/gm, "")
      .replace(/\/\/.*$/gm, "");

    const capIdx = codeOnly.indexOf("check-db-capacity.mjs");
    // Find the apply-migrations.mjs that comes AFTER the capacity gate
    // (the normal path, not the recovery mode block which appears earlier)
    const applyIdx = codeOnly.indexOf("apply-migrations.mjs", capIdx);
    expect(capIdx).toBeGreaterThan(-1);
    expect(applyIdx).toBeGreaterThan(-1);
    expect(capIdx).toBeLessThan(applyIdx);
  });

  it("capacity gate failure suggests recovery mode", () => {
    expect(src).toContain("capacity emergency caused by api_request telemetry bloat");
    expect(src).toContain("AXTASK_DB_RECOVERY_MODE=true npm run start");
  });

  it("still has environment gate first", () => {
    expect(src).toContain("Environment gate (check-env.mjs --prod)");
  });

  it("still skips drizzle push by default in production", () => {
    expect(src).toContain("SKIP_DB_PUSH_ON_START");
    expect(src).toContain("AXTASK_ALLOW_DB_PUSH_ON_START");
    expect(src).toContain("runningOnRender");
    expect(src).toContain("nonInteractive");
  });
});

describe("[13-deployment-config] chain order verification", () => {
  const src = fs.readFileSync(path.join(repoRoot, "scripts", "production-start.mjs"), "utf8");

  // Strip comments
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\*.*$/gm, "")
    .replace(/\/\/.*$/gm, "");

  it("env gate -> capacity gate -> migrations -> drizzle -> server (normal)", () => {
    const envIdx = codeOnly.indexOf("check-env.mjs");
    const capIdx = codeOnly.indexOf("check-db-capacity.mjs");
    // Find apply-migrations.mjs AFTER capacity gate (normal path)
    const applyIdx = codeOnly.indexOf("apply-migrations.mjs", capIdx);
    const drizzleIdx = codeOnly.indexOf("drizzle-kit");
    const spawnIdx = codeOnly.search(/\bspawn\s*\(\s*process\.execPath\s*,\s*\[distIndex\]/);

    expect(envIdx).toBeGreaterThan(-1);
    expect(capIdx).toBeGreaterThan(-1);
    expect(applyIdx).toBeGreaterThan(-1);
    expect(drizzleIdx).toBeGreaterThan(-1);
    expect(spawnIdx).toBeGreaterThan(-1);

    expect(envIdx).toBeLessThan(capIdx);
    expect(capIdx).toBeLessThan(applyIdx);
    expect(applyIdx).toBeLessThan(drizzleIdx);
    expect(drizzleIdx).toBeLessThan(spawnIdx);
  });

  it("recovery mode: env gate runs first, then recovery block runs migrations and exits", () => {
    // The env gate runs BEFORE the recovery mode check
    const envIdx = codeOnly.indexOf("check-env.mjs");
    const recoveryIdx = codeOnly.indexOf("if (recoveryMode)");
    const applyIdxInRecovery = codeOnly.indexOf("apply-migrations.mjs", recoveryIdx);

    expect(envIdx).toBeGreaterThan(-1);
    expect(recoveryIdx).toBeGreaterThan(-1);
    expect(applyIdxInRecovery).toBeGreaterThan(-1);
    expect(envIdx).toBeLessThan(recoveryIdx);
    expect(recoveryIdx).toBeLessThan(applyIdxInRecovery);
  });
});