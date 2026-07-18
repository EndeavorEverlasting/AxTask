import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const promptPath = resolve(repoRoot, "docs/ops/gnhf/axtask-night-sprint.md");
const runbookPath = resolve(repoRoot, "docs/ops/gnhf/README.md");
const validatorPath = resolve(repoRoot, "scripts/ops/validate-axtask-gnhf-prompt.mjs");

describe("AxTask DeepSeek GNHF prompt", () => {
  it("passes the deterministic prompt validator", () => {
    const result = spawnSync(process.execPath, [validatorPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env },
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("AxTask GNHF prompt validation passed.");
  });

  it("keeps provider routing separate from the AxTask objective", () => {
    const prompt = readFileSync(promptPath, "utf8");
    const runbook = readFileSync(runbookPath, "utf8");

    expect(prompt).toContain("Operational-failure rule:");
    expect(prompt).toContain(
      "Provider authentication, quota, rate limit, network, model discovery, spawn timeout",
    );
    expect(prompt).toContain("Do not modify AxTask to compensate for an operational failure.");

    expect(runbook).toContain("-Agent deepseek");
    expect(runbook).toContain('-DeepSeekModel "deepseek/deepseek-v4-pro"');
    expect(runbook).toContain("native GNHF `opencode` adapter");
    expect(runbook).not.toMatch(/\s-PushBranch(?:\s|$)/);
  });

  it("requires a tracked local result without live authority", () => {
    const prompt = readFileSync(promptPath, "utf8");

    expect(prompt).toContain("one coherent local commit is ahead of the base");
    expect(prompt).toContain("Process exit code zero, a model response, or an uncommitted diff is not delivery proof.");
    expect(prompt).toContain("No push, merge, deployment, release, tag, production mutation, or remote PR cleanup.");
    expect(prompt).toContain("They do not prove a pushed branch, reviewed PR, merged code, Render deployment");
  });
});
