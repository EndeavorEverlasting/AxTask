#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const promptPath = resolve(repoRoot, "docs/ops/gnhf/axtask-night-sprint.md");
const readmePath = resolve(repoRoot, "docs/ops/gnhf/README.md");
const launcherPath = resolve(repoRoot, "scripts/ops/Start-AxTaskGnhfNight.ps1");
const cmdPath = resolve(repoRoot, "Run-AxTaskGnhfNight.cmd");

const prompt = readFileSync(promptPath, "utf8");
const readme = readFileSync(readmePath, "utf8");
const launcher = readFileSync(launcherPath, "utf8");
const cmd = readFileSync(cmdPath, "utf8");
const failures = [];

function requireText(text, needle, label) {
  if (!text.includes(needle)) failures.push(`${label}: missing ${JSON.stringify(needle)}`);
}
function forbidPattern(text, pattern, label) {
  if (pattern.test(text)) failures.push(`${label}: forbidden pattern ${pattern}`);
}

for (const requirement of [
  "Repo: EndeavorEverlasting/AxTask",
  "Sprint: AxTask DeepSeek Overnight Evidence-to-Repair",
  "Lane: one reproducible, non-colliding failure cluster",
  "Run profile: OVERNIGHT",
  "Dependencies:",
  "Authority and inspection order:",
  "Owned scope:",
  "Forbidden scope:",
  "Objective:",
  "Selection rules:",
  "Execution loop:",
  "No-progress rule:",
  "Operational-failure rule:",
  "Positive completion condition:",
  "Required tracked deliverable:",
  "Validation floor:",
  "Commit contract:",
  "Final report:",
  "Proof ceiling:",
  "git status --short",
  "git branch --show-current",
  "git log --oneline --decorate -5",
  "npm run check",
  "git diff --check",
  "AXTASK_NIGHT_REPORT.md",
  "Stop after two consecutive iterations produce no tracked diff",
  "Process exit code zero, a model response, or an uncommitted diff is not delivery proof.",
  "No push, merge, deployment, release, tag, production mutation, or remote PR cleanup.",
]) requireText(prompt, requirement, "runtime objective");

for (const requirement of [
  '$RepoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\\.."))',
  "Set-Location -LiteralPath $RepoPath",
  "Start-ProviderRoutedGnhfSprint.ps1",
  "Install-ProviderRoutedGnhf.ps1",
  "-RepairControlPlane",
  "-Model $Model",
  "-MaxIterations $MaxIterations",
  "-MaxTokens $MaxTokens",
  "-ProbeTimeoutSeconds $ProbeTimeoutSeconds",
  "-StopWhen $StopWhen",
  "logs\\provider-routes",
]) requireText(launcher, requirement, "PowerShell launch artifact");

const directoryIndex = launcher.indexOf("Set-Location -LiteralPath $RepoPath");
const gitIndex = launcher.indexOf("git rev-parse");
const repairInvocationIndex = launcher.indexOf("& pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File $RepairScript -Apply");
if (directoryIndex < 0 || gitIndex < 0 || directoryIndex > gitIndex) failures.push("PowerShell launch artifact: Set-Location must occur before Git logic");
if (directoryIndex < 0 || repairInvocationIndex < 0 || directoryIndex > repairInvocationIndex) failures.push("PowerShell launch artifact: Set-Location must occur before installation logic");

for (const requirement of ['cd /d "%~dp0"', 'Start-AxTaskGnhfNight.ps1" -RepairControlPlane', "exit /b %_code%"])
  requireText(cmd, requirement, "CMD launch artifact");

for (const requirement of [
  "The objective and the launcher are different artifacts:",
  "Run-AxTaskGnhfNight.cmd",
  "directory-first PowerShell launch artifact",
  "GNHF `0.1.42` or newer",
  "GNHF adapter:   OpenCode",
  "provider/model: deepseek/deepseek-v4-pro",
  "stops before GNHF when provider preflight fails",
  "three consecutive GNHF iterations",
  "git worktree list",
  "npm run check",
  "A successful provider probe proves only",
]) requireText(readme, requirement, "runbook");

forbidPattern(prompt, /DEEPSEEK_API_KEY\s*=/i, "secret contract");
forbidPattern(readme, /DEEPSEEK_API_KEY\s*=/i, "secret contract");
forbidPattern(launcher, /DEEPSEEK_API_KEY\s*=/i, "secret contract");
forbidPattern(`${prompt}\n${readme}\n${launcher}`, /sk-[A-Za-z0-9_-]{16,}/, "secret contract");
forbidPattern(prompt, /git\s+(?:reset\s+--hard|clean\s+-[a-z]*f|push\s+--force)/i, "Git safety contract");
forbidPattern(launcher, /^\s*(?:&\s+)?(?:gnhf(?:\.ps1|\.cmd)?|\$gnhf(?:Path|Command|Launcher)?)\s+(?:`\s*)?--agent\b/im, "control-plane bypass");
forbidPattern(launcher, /--agent\s+deepseek/i, "fictional adapter");
forbidPattern(launcher, /(?:-PushBranch|--push)(?:\s|$)/i, "first-run push");
forbidPattern(`${launcher}\n${readme}\n${cmd}`, /C:\\Users\\[A-Za-z0-9._-]+/i, "machine-specific path");

const repoDeclarations = prompt.match(/^Repo:/gm) ?? [];
if (repoDeclarations.length !== 1) failures.push(`runtime objective: expected exactly one Repo declaration, found ${repoDeclarations.length}`);
if (prompt.trimStart().startsWith("gnhf `") || prompt.includes("Set-Location -LiteralPath")) failures.push("runtime objective: executable launch logic must remain in the launcher artifact");
if (launcher.includes("Repo: EndeavorEverlasting/AxTask\n\nSprint:")) failures.push("PowerShell launch artifact: do not inline the full runtime objective into the launcher");

if (failures.length > 0) {
  console.error("AxTask GNHF harness validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AxTask GNHF harness validation passed.");
console.log(`Runtime objective: ${promptPath}`);
console.log(`PowerShell launcher: ${launcherPath}`);
console.log(`CMD launcher: ${cmdPath}`);
console.log(`Runbook: ${readmePath}`);
