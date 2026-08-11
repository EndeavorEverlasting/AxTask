import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("post-R1 recovery wave contract", () => {
  it("keeps safe recovery work parallel and source-read-only", () => {
    const run = spawnSync(process.execPath, ["scripts/ai-harness/validate-recovery-wave.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain("[recovery-wave] PASS");
  });

  it("requires fail-closed prerequisites before R3 dependent operator execution", () => {
    const guardrails = fs.readFileSync("AGENT_GUARDRAILS.md", "utf8");
    const queue = fs.readFileSync(".ai/WORK_QUEUE.md", "utf8");
    const r3 = queue.match(/^## AXQ-003\b[\s\S]*?(?=^## AXQ-004\b)/m)?.[0] ?? "";

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
