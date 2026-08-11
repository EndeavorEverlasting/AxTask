import fs from "node:fs";
import { spawnSync } from "node:child_process";
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
});
