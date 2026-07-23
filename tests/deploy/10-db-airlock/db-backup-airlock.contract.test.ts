import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..", "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

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

  it("loads dotenv for db airlock npm scripts", () => {
    expect(pkg.scripts["db:backup"]).toContain("dotenv/config");
    expect(pkg.scripts["db:backup:preflight"]).toContain("dotenv/config");
    expect(pkg.scripts["db:restore:test"]).toContain("dotenv/config");
    expect(pkg.scripts["db:migrate:safe"]).toContain("dotenv/config");
  });

  it("pg-tools helper resolves Windows PATH and finds manifests without bash", () => {
    const src = fs.readFileSync(path.join(root, "scripts/db/pg-tools.mjs"), "utf8");
    expect(src).toMatch(/win32/);
    expect(src).toMatch(/shell:\s*true/);
    expect(src).toMatch(/latestDbManifest/);
    const preflight = fs.readFileSync(path.join(root, "scripts/db/preflight-backup.mjs"), "utf8");
    expect(preflight).toMatch(/latestDbManifest/);
    expect(preflight).not.toMatch(/bash/);
  });

  it("airlock enforces db_dump kind and skip acknowledgement", () => {
    const src = fs.readFileSync(path.join(root, "scripts/migration-airlock.mjs"), "utf8");
    expect(src).toMatch(/backupKind/);
    expect(src).toMatch(/db_dump/);
    expect(src).toMatch(/MIGRATION_AIRLOCK_SKIP_ACK/);
    expect(src).toMatch(/latestDbManifest/);
    expect(src).toMatch(/filesystem db_dump checkpoint/);
  });
});
