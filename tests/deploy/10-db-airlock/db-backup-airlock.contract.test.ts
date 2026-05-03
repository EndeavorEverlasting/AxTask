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
  });

  it("airlock enforces db_dump kind and skip acknowledgement", () => {
    const src = fs.readFileSync(path.join(root, "scripts/migration-airlock.mjs"), "utf8");
    expect(src).toMatch(/backupKind/);
    expect(src).toMatch(/db_dump/);
    expect(src).toMatch(/MIGRATION_AIRLOCK_SKIP_ACK/);
  });
});
