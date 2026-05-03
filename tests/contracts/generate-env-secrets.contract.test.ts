// @vitest-environment node
/**
 * Guards the production secret generator so operators can provision secrets
 * without accidentally writing generated values into the repository.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(root, "scripts", "generate-env-secrets.mjs");
const scriptSrc = fs.readFileSync(scriptPath, "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

describe("generate-env-secrets provisioning contract", () => {
  it("package.json exposes env:secrets:generate", () => {
    expect(pkg.scripts["env:secrets:generate"]).toBe("node scripts/generate-env-secrets.mjs");
  });

  it("uses node crypto randomBytes for generated values", () => {
    expect(scriptSrc).toMatch(/from\s+"node:crypto"/);
    expect(scriptSrc).toContain("randomBytes");
  });

  it("prints the core stable production secrets", () => {
    expect(scriptSrc).toContain("SESSION_SECRET");
    expect(scriptSrc).toContain("AUTH_AUDIT_PEPPER");
    expect(scriptSrc).toContain("TOTP_ENCRYPTION_KEY");
    expect(scriptSrc).toContain("ARCHETYPE_ANALYTICS_SALT");
  });

  it("prints feature secrets but not provider-issued credentials", () => {
    expect(scriptSrc).toContain("BACKUP_ENCRYPTION_KEY");
    expect(scriptSrc).toContain("AXTASK_ALARM_COMPANION_SECRET");
    expect(scriptSrc).not.toContain("GOOGLE_CLIENT_SECRET=");
    expect(scriptSrc).not.toContain("DATABASE_URL=");
    expect(scriptSrc).not.toContain("BACKUP_S3_SECRET_ACCESS_KEY=");
  });

  it("does not write generated secrets to disk", () => {
    expect(scriptSrc).not.toMatch(/fs\.(write|append)File(Sync)?\s*\(/);
    expect(scriptSrc).not.toMatch(/writeFile|appendFile/);
    expect(scriptSrc).toMatch(/process\.stdout\.write/);
  });

  it("refuses to print secrets in CI by default", () => {
    expect(scriptSrc).toContain('process.env.CI === "true"');
    expect(scriptSrc).toContain("--allow-ci-output");
  });
});
