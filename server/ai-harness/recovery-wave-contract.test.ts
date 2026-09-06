import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("post-R1 recovery wave contract", () => {
  it("keeps safe recovery work parallel and source-read-only", () => {
    const run = spawnSync(process.execPath, ["scripts/ai-harness/validate-recovery-wave.mjs"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });

    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain("[recovery-wave] PASS");
  });

  it("executes R3 prerequisite validation behavior before the dump can start", async () => {
    const preflight = await import("../../scripts/db/preflight-backup.mjs");
    const tools = await import("../../scripts/db/pg-tools.mjs");
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-r3-preflight-contract-"));
    const repo = path.join(scratch, "repo");
    const protectedDir = path.join(scratch, "protected");
    fs.mkdirSync(repo);
    fs.mkdirSync(protectedDir);

    try {
      const source = "postgresql://source:secret@db.example.invalid:5432/axtask?sslmode=require";
      const sameTargetDifferentCredentials = "postgresql://other:secret@db.example.invalid:5432/axtask";
      const loopbackSource = "postgresql://postgres:postgres@127.0.0.1:5432/axtask";
      const localhostSource = "postgresql://postgres:postgres@localhost:5432/axtask";
      const ipv6LoopbackSource = "postgresql://postgres:postgres@[::1]:5432/axtask";
      const disposable = "postgresql://postgres:postgres@127.0.0.1:5432/axtask_restore";
      const ipv6Disposable = "postgresql://postgres:postgres@[::1]:5432/axtask_restore";
      const overriddenRestore = "postgresql://postgres:postgres@localhost:5432/axtask_restore?host=db.example.invalid";

      expect(() =>
        preflight.validateBackupStorageConfig({
          env: { BACKUP_STORAGE_TARGET: "s3", BACKUP_LOCAL_DIR: protectedDir },
          cwd: repo,
          recoveryMode: true,
        }),
      ).toThrow(/supports local only/);

      expect(() =>
        preflight.validateBackupStorageConfig({
          env: { BACKUP_STORAGE_TARGET: "local", BACKUP_LOCAL_DIR: "relative-backups" },
          cwd: repo,
          recoveryMode: true,
        }),
      ).toThrow(/absolute protected-storage path/);

      expect(
        preflight.validateBackupStorageConfig({
          env: { BACKUP_STORAGE_TARGET: "local", BACKUP_LOCAL_DIR: protectedDir },
          cwd: repo,
          recoveryMode: true,
        }),
      ).toBe(fs.realpathSync(protectedDir));

      const insideRepoStorage = path.join(repo, "inside-protected");
      const linkedProtected = path.join(scratch, "linked-protected");
      fs.mkdirSync(insideRepoStorage);
      fs.symlinkSync(insideRepoStorage, linkedProtected, process.platform === "win32" ? "junction" : "dir");
      expect(() =>
        preflight.validateBackupStorageConfig({
          env: { BACKUP_STORAGE_TARGET: "local", BACKUP_LOCAL_DIR: linkedProtected },
          cwd: repo,
          recoveryMode: true,
        }),
      ).toThrow(/resolves inside the repository checkout/);

      const protectedDescendant = path.join(scratch, "protected-descendant");
      const escapedDb = path.join(repo, "escaped-db");
      fs.mkdirSync(protectedDescendant);
      fs.mkdirSync(escapedDb);
      fs.symlinkSync(escapedDb, path.join(protectedDescendant, "db"), process.platform === "win32" ? "junction" : "dir");
      expect(() => tools.ensureRecoveryBackupDirectory(protectedDescendant, "2026-08-12")).toThrow(
        /db directory resolves outside protected storage/,
      );

      expect(() => preflight.assertDistinctDatabaseTargets(source, sameTargetDifferentCredentials)).toThrow(
        /different database/,
      );
      expect(() => preflight.assertDistinctDatabaseTargets(source, overriddenRestore)).toThrow(/connection-target override/);
      expect(() => preflight.assertDistinctDatabaseTargets(localhostSource, loopbackSource)).toThrow(/different database/);
      expect(tools.databaseTargetFingerprint(localhostSource)).toBe(tools.databaseTargetFingerprint(ipv6LoopbackSource));
      expect(() => preflight.assertDisposableRestoreTarget("postgresql://postgres:postgres@restore.example.invalid:5432/axtask_restore")).toThrow(
        /loopback\/disposable/,
      );
      expect(() => preflight.assertDistinctDatabaseTargets(source, disposable)).not.toThrow();
      expect(() => preflight.assertDisposableRestoreTarget(disposable)).not.toThrow();
      expect(() => preflight.assertDisposableRestoreTarget(ipv6Disposable)).not.toThrow();

      expect(preflight.isProdLike(loopbackSource, {})).toBe(false);
      expect(preflight.isProdLike(ipv6LoopbackSource, {})).toBe(false);
      expect(() =>
        preflight.validateRecoveryTargets(
          loopbackSource,
          "postgresql://postgres:postgres@restore.example.invalid:5432/axtask_restore",
        ),
      ).toThrow(/loopback\/disposable/);

      const tenGiB = 10 * 1024 ** 3;
      const required = preflight.requiredBackupCapacityBytes(tenGiB);
      expect(required).toBe(Math.ceil(tenGiB * 1.15));
      expect(() => preflight.assertStorageCapacity({ sourceBytes: tenGiB, freeBytes: required - 1 })).toThrow(
        /capacity is insufficient/,
      );
      expect(preflight.assertStorageCapacity({ sourceBytes: tenGiB, freeBytes: required })).toBe(required);

      const exact = path.join(protectedDir, "exact.manifest.json");
      const competitor = path.join(protectedDir, "newer.manifest.json");
      expect(tools.resolveRestoreManifest({ explicitPath: exact, recoveryMode: true, latestPath: competitor })).toBe(exact);
      expect(() => tools.resolveRestoreManifest({ recoveryMode: true, latestPath: competitor })).toThrow(/exact manifest path/);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }

    const src = fs.readFileSync(path.join(REPO_ROOT, "scripts", "db", "preflight-backup.mjs"), "utf8");
    const backupStart = src.indexOf("const backupArgs = [");
    expect(backupStart).toBeGreaterThan(0);
    for (const marker of [
      'probePgTool("pg_dump")',
      'probePgTool("pg_restore")',
      "assertStorageWritable(storageRoot)",
      "queryDatabaseSize(url)",
      "verifyRestoreTargetConnectivity(restoreUrl)",
      "storageFreeBytes(storageRoot)",
      "assertStorageCapacity({ sourceBytes, freeBytes })",
    ]) {
      const markerIndex = src.indexOf(marker);
      expect(markerIndex, `${marker} must exist`).toBeGreaterThan(0);
      expect(markerIndex, `${marker} must execute before backup spawn`).toBeLessThan(backupStart);
    }
    expect(src).toContain('args.includes("--validate-only")');

    const backup = fs.readFileSync(path.join(REPO_ROOT, "scripts", "db", "backup.mjs"), "utf8");
    const directRecoveryGate = backup.indexOf('["scripts/db/preflight-backup.mjs", "--no-ledger", "--validate-only"]');
    const directPgDump = backup.indexOf('runPgTool("pg_dump"');
    expect(directRecoveryGate).toBeGreaterThan(0);
    expect(directPgDump).toBeGreaterThan(directRecoveryGate);
    expect(backup).toContain("ensureRecoveryBackupDirectory");

    const restore = fs.readFileSync(path.join(REPO_ROOT, "scripts", "db", "restore-test.mjs"), "utf8");
    expect(restore).toContain("!manifest.databaseFingerprint || manifest.databaseFingerprint !== sourceFingerprint");
    expect(restore).toContain("recovery restore requires --file=<exact manifest path>");
  });

  it("records the fail-closed operator rule alongside R3's declared prerequisites", () => {
    const guardrails = fs.readFileSync(path.join(REPO_ROOT, "AGENT_GUARDRAILS.md"), "utf8");
    const queue = fs.readFileSync(path.join(REPO_ROOT, ".ai", "WORK_QUEUE.md"), "utf8");
    const r3 = queue.match(/^## AXQ-003\b[\s\S]*?(?=^## AXQ-\d+\b|(?![\s\S]))/m)?.[0] ?? "";

    expect(guardrails).toContain("**Fail-closed operator blocks.**");
    for (const marker of [
      "repository identity/version",
      "credential presence",
      "target separation",
      "storage",
      "capacity",
      "provider state",
      "validate all prerequisites first",
      "On failure, end that operator action",
      "structurally unable to continue after failure",
      "Never print or commit database connection values.",
    ]) {
      expect(guardrails).toContain(marker);
    }

    expect(r3).not.toBe("");
    for (const marker of ["DATABASE_URL", "BACKUP_STORAGE_TARGET", "protected storage", "PostgreSQL client tools", "RESTORE_DATABASE_URL"]) {
      expect(r3).toContain(marker);
    }
  });

  it("keeps R3 backup/rollback distinct from R5 physical reclaim", () => {
    const queue = fs.readFileSync(path.join(REPO_ROOT, ".ai", "WORK_QUEUE.md"), "utf8");
    const runbook = fs.readFileSync(path.join(REPO_ROOT, "docs", "DB_RECOVERY_RUNBOOK.md"), "utf8");
    const wave = fs.readFileSync(path.join(REPO_ROOT, "docs", "DB_RECOVERY_SUBPART_WAVE.md"), "utf8");
    const r3 = queue.match(/^## AXQ-003\b[\s\S]*?(?=^## AXQ-\d+\b|(?![\s\S]))/m)?.[0] ?? "";
    const r56 = queue.match(/^## AXQ-008\b[\s\S]*?(?=^## AXQ-\d+\b|(?![\s\S]))/m)?.[0] ?? "";
    const r3Scope = r3.match(/^- \*\*Scope:\*\*\s*(.*)$/m)?.[1] ?? "";
    const r3Next = r3.match(/^- \*\*Next action:\*\*\s*(.*)$/m)?.[1] ?? "";
    const r3Forbidden = r3.match(/^- \*\*Forbidden:\*\*\s*(.*)$/m)?.[1] ?? "";
    const r3SectionStart = runbook.indexOf("## R3 — backup and rollback proof");
    const r4SectionStart = runbook.indexOf("## R4 — targeted logical cleanup");
    const r3Runbook = runbook.slice(r3SectionStart, r4SectionStart);
    const r3Commands = [...r3Runbook.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
      .map((match) => match[1])
      .join("\n");
    const r56Scope = r56.match(/^- \*\*Scope:\*\*\s*(.*)$/m)?.[1] ?? "";
    const normalizedCommands = r3Commands.toLowerCase().replace(/\s+/g, " ");
    const r3ScopeWithoutNegation = r3Scope.toLowerCase().replace(/not physical reclaim/g, "");

    expect(r3).not.toBe("");
    expect(r56).not.toBe("");
    expect(r3Scope.toLowerCase()).toMatch(/backup/);
    expect(r3Scope.toLowerCase()).toMatch(/restore/);
    expect(r3Scope.toLowerCase()).toMatch(/not physical reclaim/);
    expect(r3ScopeWithoutNegation).not.toMatch(/reclaim/);
    expect(r3Next.toLowerCase()).not.toMatch(/reclaim/);
    expect(r3Forbidden.toLowerCase()).toMatch(/\breclaim\b/);
    expect(r3Forbidden.toLowerCase()).not.toMatch(/\b(?:allow|allows|allowed|permit|permits|permitted)\b.{0,24}\breclaim\b|\breclaim\b.{0,24}\b(?:allow|allows|allowed|permit|permits|permitted)\b/);
    expect(r56Scope.toLowerCase()).toMatch(/physical reclaim/);
    expect(r3Runbook).toContain("not physical reclaim");
    expect(normalizedCommands).not.toMatch(/vacuum\s+full|db-reclaim-api-request/);
    expect(wave).toContain("not physical reclaim");
  });
});
