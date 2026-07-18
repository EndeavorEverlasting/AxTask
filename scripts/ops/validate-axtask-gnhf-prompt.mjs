#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const promptPath = resolve(repoRoot, "docs/ops/gnhf/axtask-night-sprint.md");
const readmePath = resolve(repoRoot, "docs/ops/gnhf/README.md");

const prompt = readFileSync(promptPath, "utf8");
const readme = readFileSync(readmePath, "utf8");
const failures = [];

function requireText(text, needle, label) {
  if (!text.includes(needle)) {
    failures.push(`${label}: missing ${JSON.stringify(needle)}`);
  }
}

function forbidPattern(text, pattern, label) {
  if (pattern.test(text)) {
    failures.push(`${label}: forbidden pattern ${pattern}`);
  }
}

const promptRequirements = [
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
];
for (const requirement of promptRequirements) {
  requireText(prompt, requirement, "prompt contract");
}

const commandMatch = readme.match(/```powershell\s*([\s\S]*?)```/i);
if (!commandMatch) {
  failures.push("launch contract: missing PowerShell command block");
} else {
  const command = commandMatch[1];
  const commandRequirements = [
    "agent-switchboard.cmd",
    "-Agent deepseek",
    '-DeepSeekModel "deepseek/deepseek-v4-pro"',
    "axtask-night-sprint.md",
    "-MaxIterations 8",
    "-MaxTokens 800000",
    "-ProbeTimeoutSeconds 20",
    "-StopWhen",
  ];
  for (const requirement of commandRequirements) {
    requireText(command, requirement, "launch contract");
  }
  if (/\s-PushBranch(?:\s|$)/.test(command)) {
    failures.push("launch contract: first-run command must not enable push");
  }
  if (/--current-branch/.test(command)) {
    failures.push("launch contract: unattended run must use the isolated worktree posture");
  }
}

const readmeRequirements = [
  "Do not add `-PushBranch` for the first night run.",
  "maps the operator alias `deepseek` to the native GNHF `opencode` adapter",
  "20-second timeout",
  "git worktree list",
  "npm run check",
  "A successful provider probe proves only",
];
for (const requirement of readmeRequirements) {
  requireText(readme, requirement, "runbook contract");
}

forbidPattern(prompt, /DEEPSEEK_API_KEY\s*=/i, "secret contract");
forbidPattern(readme, /DEEPSEEK_API_KEY\s*=/i, "secret contract");
forbidPattern(prompt, /sk-[A-Za-z0-9_-]{16,}/, "secret contract");
forbidPattern(readme, /sk-[A-Za-z0-9_-]{16,}/, "secret contract");
forbidPattern(prompt, /git\s+(?:reset\s+--hard|clean\s+-[a-z]*f|push\s+--force)/i, "git safety contract");

const repoDeclarations = prompt.match(/^Repo:/gm) ?? [];
if (repoDeclarations.length !== 1) {
  failures.push(`prompt contract: expected exactly one Repo declaration, found ${repoDeclarations.length}`);
}

if (failures.length > 0) {
  console.error("AxTask GNHF prompt validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("AxTask GNHF prompt validation passed.");
console.log(`Prompt: ${promptPath}`);
console.log(`Runbook: ${readmePath}`);
