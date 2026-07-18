import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const promptPath = resolve(repoRoot, "docs/ops/gnhf/axtask-night-sprint.md");
const runbookPath = resolve(repoRoot, "docs/ops/gnhf/README.md");
const launcherPath = resolve(repoRoot, "scripts/ops/Start-AxTaskGnhfNight.ps1");
const cmdPath = resolve(repoRoot, "Run-AxTaskGnhfNight.cmd");
const validatorPath = resolve(repoRoot, "scripts/ops/validate-axtask-gnhf-prompt.mjs");

const directGnhfInvocation =
  /^\s*(?:&\s+)?(?:gnhf(?:\.ps1|\.cmd)?|\$gnhf(?:Path|Command|Launcher)?)\s+(?:`\s*)?--agent\b/im;

describe("AxTask DeepSeek GNHF harness", () => {
  it("passes the deterministic harness validator", () => {
    const result = spawnSync(process.execPath, [validatorPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env },
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("AxTask GNHF harness validation passed.");
  });

  it("keeps the runtime objective separate from launch logic", () => {
    const prompt = readFileSync(promptPath, "utf8");
    const launcher = readFileSync(launcherPath, "utf8");

    expect(prompt).toContain("Operational-failure rule:");
    expect(prompt).toContain(
      "Provider authentication, quota, rate limit, network, model discovery, spawn timeout",
    );
    expect(prompt).not.toContain("Set-Location -LiteralPath");
    expect(prompt.trimStart()).not.toMatch(/^gnhf\s+`/);

    expect(launcher).toContain("Set-Location -LiteralPath $RepoPath");
    expect(launcher).toContain("Start-ProviderRoutedGnhfSprint.ps1");
    expect(launcher).not.toMatch(directGnhfInvocation);
  });

  it("enters the repository before Git or repair execution", () => {
    const launcher = readFileSync(launcherPath, "utf8");
    const cmd = readFileSync(cmdPath, "utf8");

    const directoryIndex = launcher.indexOf("Set-Location -LiteralPath $RepoPath");
    expect(directoryIndex).toBeGreaterThanOrEqual(0);
    expect(directoryIndex).toBeLessThan(launcher.indexOf("git rev-parse"));
    expect(directoryIndex).toBeLessThan(
      launcher.indexOf("& pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File $RepairScript -Apply"),
    );
    expect(cmd).toContain('cd /d "%~dp0"');
  });

  it("uses truthful DeepSeek routing without first-run push", () => {
    const launcher = readFileSync(launcherPath, "utf8");
    const runbook = readFileSync(runbookPath, "utf8");

    expect(launcher).toContain("-Model $Model");
    expect(launcher).not.toContain("--agent deepseek");
    expect(launcher).not.toMatch(/(?:-PushBranch|--push)(?:\s|$)/);
    expect(runbook).toContain("GNHF adapter:   OpenCode");
    expect(runbook).toContain("provider/model: deepseek/deepseek-v4-pro");
    expect(runbook).toContain("GNHF `0.1.42` or newer");
  });

  it("requires tracked local delivery without live authority", () => {
    const prompt = readFileSync(promptPath, "utf8");
    const runbook = readFileSync(runbookPath, "utf8");

    expect(prompt).toContain("one coherent local commit is ahead of the base");
    expect(prompt).toContain(
      "Process exit code zero, a model response, or an uncommitted diff is not delivery proof.",
    );
    expect(runbook).toContain("stops before GNHF when provider preflight fails");
    expect(runbook).toContain("A GNHF exit code proves only process completion.");
  });
});
