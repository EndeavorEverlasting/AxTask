// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

describe("deploy / schema workflow guards", () => {
  it("docker-compose migrate runs SQL migrations before drizzle db:push", () => {
    const composePath = path.join(projectRoot, "docker-compose.yml");
    const compose = fs.readFileSync(composePath, "utf8");

    expect(compose).toContain("migrate:");
    expect(compose).toContain(
      'command: ["sh", "-c", "node scripts/apply-migrations.mjs && npm run db:push"]',
    );
    const migrateIdx = compose.indexOf("migrate:");
    const cmdIdx = compose.indexOf("node scripts/apply-migrations.mjs && npm run db:push");
    expect(cmdIdx).toBeGreaterThan(migrateIdx);
  });

  it("production Dockerfile CMD runs migrations then push then server", () => {
    const dockerfile = fs.readFileSync(path.join(projectRoot, "Dockerfile"), "utf8");
    const cmdMatch = dockerfile.match(/CMD\s*\[\s*"sh",\s*"-c",\s*"([^"]+)"\s*\]/);
    expect(cmdMatch, "Dockerfile CMD").toBeTruthy();
    const shellBody = cmdMatch![1];
    const applyIdx = shellBody.indexOf("node scripts/apply-migrations.mjs");
    const pushIdx = shellBody.indexOf("drizzle-kit push --force");
    const nodeIdx = shellBody.indexOf("node dist/index.js");
    expect(applyIdx).toBeLessThan(pushIdx);
    expect(pushIdx).toBeLessThan(nodeIdx);
  });

  it("offline-start applies SQL migrations and fingerprints migrations/*.sql", () => {
    const src = fs.readFileSync(path.join(projectRoot, "tools", "local", "offline-start.mjs"), "utf8");
    expect(src).toContain("buildMigrationsDirFingerprint");
    expect(src).toContain("ensureSqlMigrationsApplied");
    expect(src).toContain("apply-migrations.mjs");
    const validateIdx = src.indexOf("validateLocalEnv();");
    const sqlIdx = src.indexOf("ensureSqlMigrationsApplied();");
    const depsIdx = src.indexOf("ensureDependenciesSynced(previousState)");
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(sqlIdx).toBeGreaterThan(validateIdx);
    expect(depsIdx).toBeGreaterThan(sqlIdx);
  });

  it("dev-with-db-push runs apply-migrations before kit workarounds and db:push", () => {
    const src = fs.readFileSync(path.join(projectRoot, "tools", "local", "dev-with-db-push.mjs"), "utf8");
    const applyIdx = src.indexOf("apply-migrations.mjs");
    const preIdx = src.indexOf("pre-db-push-kit-workarounds.mjs");
    const pushIdx = src.indexOf('["run", "db:push"]');
    expect(applyIdx).toBeLessThan(preIdx);
    expect(preIdx).toBeLessThan(pushIdx);
  });

  it("package.json exposes db:push scripts used by compose and local tooling", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    expect(pkg.scripts["db:push"]).toBeTruthy();
    expect(pkg.scripts["db:push:ci"]).toBeTruthy();
    expect(pkg.scripts["dev:smart"]).toContain("offline-start.mjs");
    expect(pkg.scripts["local:env-init"]).toContain("copy-env-local.mjs");
  });
});
