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

  it("loads dotenv within each directly invoked db command", () => {
    expect(read("scripts/db/backup.mjs")).toContain('import "dotenv/config"');
    expect(read("scripts/db/preflight-backup.mjs")).toContain('import "dotenv/config"');
    expect(read("scripts/db/restore-test.mjs")).toContain('import "dotenv/config"');
    expect(read("scripts/apply-migrations.mjs")).toContain("dotenv/config");
    expect(read("scripts/migration/verify-schema.mjs")).toContain("dotenv/config");
  });

  it("pg-tools helper resolves Windows PATH and finds manifests without bash", () => {
    const src = read("scripts/db/pg-tools.mjs");
    expect(src).toMatch(/win32/);
    expect(src).toMatch(/shell:\s*true/);
    expect(src).toMatch(/latestDbManifest/);
    const preflight = read("scripts/db/preflight-backup.mjs");
    expect(preflight).toMatch(/latestDbManifest/);
    expect(preflight).not.toMatch(/bash/);
  });

  it("airlock enforces db_dump kind and skip acknowledgement", () => {
    const src = read("scripts/migration-airlock.mjs");
    expect(src).toMatch(/backupKind/);
    expect(src).toMatch(/db_dump/);
    expect(src).toMatch(/MIGRATION_AIRLOCK_SKIP_ACK/);
    expect(src).toMatch(/latestDbManifest/);
    expect(src).toMatch(/filesystem db_dump checkpoint/);
  });
});
