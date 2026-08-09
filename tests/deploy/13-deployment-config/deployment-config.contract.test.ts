/**
 * Deployment recovery contracts:
 * - render.yaml has no baked database budget and keeps auto-deploy off during recovery
 * - normal production startup remains fail-closed and cannot perform recovery mutations
 * - one-off containment is a separate, explicitly authorized command
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const renderYaml = fs.readFileSync(path.join(repoRoot, "render.yaml"), "utf8");
const productionStart = fs.readFileSync(
  path.join(repoRoot, "scripts", "production-start.mjs"),
  "utf8",
);
const containment = fs.readFileSync(
  path.join(repoRoot, "scripts", "db-contain-api-request.mjs"),
  "utf8",
);

describe("[13-deployment-config] render.yaml", () => {
  it("does not bake in an AXTASK_DB_SIZE_BUDGET_BYTES value", () => {
    expect(renderYaml).toContain("OPERATOR BUDGET (optional)");
    expect(renderYaml).toContain("REPORT-ONLY mode");
    expect(renderYaml).toContain("operator-selected operational/spend");
    expect(renderYaml).toContain('#   value: "<operator-approved-byte-count>"');
    expect(renderYaml).not.toMatch(
      /^\s*- key: AXTASK_DB_SIZE_BUDGET_BYTES\s*\n\s*value:/m,
    );
    expect(renderYaml).not.toContain("10737418240");
  });

  it("keeps auto-deploy disabled for controlled production re-entry", () => {
    expect(renderYaml).toContain("autoDeploy: false");
    expect(renderYaml).toContain("must not wake or redeploy the suspended service");
  });

  it("keeps DB-free liveness and guarded Drizzle policy", () => {
    expect(renderYaml).toContain("healthCheckPath: /health");
    expect(renderYaml).toContain("SKIP_DB_PUSH_ON_START");
    expect(renderYaml).toContain('value: "true"');
  });
});

describe("[13-deployment-config] production-start.mjs", () => {
  it("does not expose a recovery mutation mode through normal startup", () => {
    expect(productionStart).not.toContain("AXTASK_DB_RECOVERY_MODE");
    expect(productionStart).not.toContain("MIGRATION_SKIP_AIRLOCK");
    expect(productionStart).toContain("Database recovery is intentionally NOT a startup mode");
  });

  it("keeps environment -> capacity -> migrations -> server order", () => {
    const codeOnly = productionStart
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const envIdx = codeOnly.indexOf("check-env.mjs");
    const capIdx = codeOnly.indexOf("check-db-capacity.mjs");
    const migrationIdx = codeOnly.indexOf("apply-migrations.mjs");
    const serverIdx = codeOnly.search(
      /\bspawn\s*\(\s*process\.execPath\s*,\s*\[distIndex\]/,
    );
    expect(envIdx).toBeGreaterThan(-1);
    expect(capIdx).toBeGreaterThan(envIdx);
    expect(migrationIdx).toBeGreaterThan(capIdx);
    expect(serverIdx).toBeGreaterThan(migrationIdx);
  });

  it("capacity failure points to read-only audit and one-off containment", () => {
    expect(productionStart).toContain("Keep production suspended");
    expect(productionStart).toContain("db-size-audit.mjs --forensics");
    expect(productionStart).toContain("db-contain-api-request.mjs");
  });

  it("still skips drizzle push by default in production", () => {
    expect(productionStart).toContain("SKIP_DB_PUSH_ON_START");
    expect(productionStart).toContain("AXTASK_ALLOW_DB_PUSH_ON_START");
    expect(productionStart).toContain("runningOnRender");
    expect(productionStart).toContain("nonInteractive");
  });
});

describe("[13-deployment-config] one-off api_request containment", () => {
  it("is dry-run by default and requires a strong execute confirmation", () => {
    expect(containment).toContain('const execute = args.has("execute")');
    expect(containment).toContain('confirm !== "CONTAIN_API_REQUEST"');
    expect(containment).toContain("--confirm=CONTAIN_API_REQUEST");
  });

  it("requires explicit production authorization for non-loopback mutation", () => {
    expect(containment).toContain("--prod");
    expect(containment).toContain("--force-production");
    expect(containment).toContain("!isLoopbackDatabase(url) && !forceProduction");
  });

  it("installs only the suppression function/trigger and deletes no rows", () => {
    expect(containment).toContain("suppress_api_request_security_events");
    expect(containment).toContain("trg_suppress_api_request_security_events");
    expect(containment).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(containment).not.toContain("applied_sql_migrations");
    expect(containment).not.toContain("apply-migrations.mjs");
  });

  it("treats only origin/always trigger states as active containment", () => {
    expect(containment).toContain('["O", "A"].includes(code)');
    expect(containment).toContain("R=replica-only");
    expect(containment).not.toContain('tgenabled !== "D"');
  });

  it("never logs DATABASE_URL", () => {
    expect(containment).not.toContain("maskedUrl");
    expect(containment).toContain('target=${isLoopbackDatabase(url) ? "loopback" : "non-loopback"}');
  });
});
