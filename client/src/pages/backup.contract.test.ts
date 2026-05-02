// @vitest-environment node
/**
 * Source-level contract test for the Backup Center page.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.resolve(__dirname, "backup.tsx"), "utf8");
const appSrc = fs.readFileSync(path.resolve(__dirname, "..", "App.tsx"), "utf8");

describe("backup page :: source contract", () => {
  it("is lazy-loaded from App.tsx", () => {
    expect(appSrc).toMatch(
      /const\s+BackupPage\s*=\s*lazy\(\s*\(\)\s*=>\s*import\("@\/pages\/backup"\)\)/,
    );
  });

  it("has a /backup route in App.tsx", () => {
    expect(appSrc).toContain('path="/backup"');
    expect(appSrc).toContain("component={BackupPage}");
  });

  it("tracks last backup download in localStorage", () => {
    expect(src).toContain('"axtask:last-json-backup-download"');
    expect(src).toContain("localStorage.setItem");
  });

  it("uses dry-run as the default import path", () => {
    expect(src).toContain("Dry run");
    expect(src).toContain("dryRun");
    expect(src).toContain("beginJsonAccountImport(true)");
  });

  it("does not falsely claim automatic scheduled backups exist", () => {
    expect(src).toContain("Not configured yet");
    expect(src).toContain("Only manual JSON backups are available");
    expect(src).not.toContain("scheduled backup");
    expect(src).not.toContain("automatic backup");
  });

  it("explains what is included and not restored", () => {
    expect(src).toContain("Tasks");
    expect(src).toContain("Badge records");
    expect(src).toContain("Wallet snapshot metadata");
    expect(src).toContain("Wallet balances");
    expect(src).toContain("Coin ledger state");
    expect(src).toContain("ledger safety rules");
  });

  it("warns in a danger zone that real import merges data", () => {
    expect(src).toContain("Danger Zone");
    expect(src).toContain("merges data into this account");
    expect(src).toContain("Run a dry run first");
    expect(src).toContain("fingerprints");
  });
});
