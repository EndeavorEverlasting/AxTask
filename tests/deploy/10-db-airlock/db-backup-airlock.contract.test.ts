import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..", "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("[10-db-airlock] command and script contract", () => {
  it("exposes required db airlock scripts", () => {
    expect(pkg.scripts["db:backup"]).toBeTruthy();
    expect(pkg.scripts["db:backup:preflight"]).toBeTruthy();
    expect(pkg.scripts["db:restore:test"]).toBeTruthy();
    expect(pkg.scripts["db:migrate:safe"]).toBeTruthy();
    expect(pkg.scripts["db:push:safe"]).toBeTruthy();
  });

  it("has script implementations", () => {
    expect(fs.existsSync(path.join(root, "scripts/db/backup.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts/db/preflight-backup.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts/db/restore-test.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts/db/pg-tools.mjs"))).toBe(true);
  });

  it("loads dotenv at the direct command or npm invocation boundary", () => {
    expect(read("scripts/db/backup.mjs")).toContain('import "dotenv/config"');
    expect(read("scripts/db/preflight-backup.mjs")).toContain('import "dotenv/config"');
    expect(read("scripts/db/restore-test.mjs")).toContain('import "dotenv/config"');
    expect(pkg.scripts["db:migrate:safe"]).toContain("node -r dotenv/config scripts/apply-migrations.mjs");
    expect(read("scripts/migration/verify-schema.mjs")).toContain('import "dotenv/config"');
  });

  it("resolves Windows pg tools and finds manifests without bash", () => {
    const src = read("scripts/db/pg-tools.mjs");
    expect(src).toMatch(/win32/);
    expect(src).toMatch(/shell:\s*true/);
    expect(src).toMatch(/latestDbManifest/);
    const preflight = read("scripts/db/preflight-backup.mjs");
    expect(preflight).toMatch(/latestDbManifest/);
    expect(preflight).not.toMatch(/bash/);
  });

  it("binds filesystem and ledger checkpoints to the current database", () => {
    const tools = read("scripts/db/pg-tools.mjs");
    const backup = read("scripts/db/backup.mjs");
    const airlock = read("scripts/migration-airlock.mjs");

    expect(tools).toMatch(/databaseTargetFingerprint/);
    expect(tools).not.toMatch(/password/);
    expect(backup).toMatch(/databaseFingerprint:\s*databaseTargetFingerprint\(databaseUrl\)/);
    expect(airlock).toMatch(/currentDatabaseFingerprint/);
    expect(airlock).toMatch(/targetMatches\(manifest, currentDatabaseFingerprint\)/);
    expect(airlock).toMatch(/meta\.backupKind === "db_dump"/);
    expect(airlock).toMatch(/no recent verified DB dump for the current database target/);
  });

  it("verifies custom-format database dumps as binary", () => {
    const airlock = read("scripts/migration-airlock.mjs");
    const verifier = read("server/services/backup-service.ts");
    expect(airlock).toMatch(/meta\.backupKind === "db_dump" \|\| meta\.encrypted \|\| meta\.compressed/);
    expect(verifier).toMatch(/meta\.backupKind === "db_dump" \|\| !!meta\.encrypted \|\| !!meta\.compressed/);
  });

  it("airlock enforces DB-dump kind and skip acknowledgement", () => {
    const src = read("scripts/migration-airlock.mjs");
    expect(src).toMatch(/backupKind/);
    expect(src).toMatch(/db_dump/);
    expect(src).toMatch(/MIGRATION_AIRLOCK_SKIP_ACK/);
    expect(src).toMatch(/latestDbManifest/);
    expect(src).toMatch(/filesystem db_dump checkpoint/);
  });
});
