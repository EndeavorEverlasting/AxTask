#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isCanonicalOrigin, resolveAxTaskCheckout } from "./resolve-checkout.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const REQUIRED_FILES = [
  ".ai/harness.json",
  ".ai/artifact-registry.json",
  ".ai/workflows/repository-location-recovery.md",
  ".ai/skills/repository-location-recovery.md",
  ".ai/skills/operator-preflight-bootstrap.md",
  ".ai/reports/repository-location-report-template.md",
  ".ai/reports/operator-preflight-report-template.md",
  "scripts/ai-harness/resolve-checkout.mjs",
  "scripts/ai-harness/operator-preflight.ps1",
  "scripts/ai-harness/validate-repo-location-recovery.mjs",
  ".github/workflows/harness-repo-location.yml",
];

function fail(message) {
  console.error(`[repo-location-recovery] FAIL ${message}`);
  process.exitCode = 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

for (const relativePath of REQUIRED_FILES) {
  if (!fs.existsSync(path.join(REPO_ROOT, relativePath))) fail(`missing required harness component: ${relativePath}`);
}

if (process.exitCode) process.exit();

const harness = JSON.parse(read(".ai/harness.json"));
for (const [id, expectedPath] of [
  ["operator-preflight-bootstrap", "scripts/ai-harness/operator-preflight.ps1"],
  ["operator-preflight-skill", ".ai/skills/operator-preflight-bootstrap.md"],
  ["operator-preflight-report", ".ai/reports/operator-preflight-report-template.md"],
]) {
  const component = harness.components?.find((entry) => entry.id === id);
  if (!component || component.path !== expectedPath) fail(`harness registration missing ${id} -> ${expectedPath}`);
}
if (!harness.skills?.includes("axtask.skill.operator-preflight-bootstrap.v1")) {
  fail("harness skills list missing axtask.skill.operator-preflight-bootstrap.v1");
}

const artifacts = JSON.parse(read(".ai/artifact-registry.json"));
const operatorArtifact = artifacts.artifacts?.find((entry) => entry.id === "operator-preflight-report");
if (!operatorArtifact) fail("artifact registry missing operator-preflight-report");
else {
  if (operatorArtifact.template !== ".ai/reports/operator-preflight-report-template.md") fail("operator-preflight-report template registration is incorrect");
  if (operatorArtifact.validator !== "node scripts/ai-harness/validate-repo-location-recovery.mjs") fail("operator-preflight-report validator registration is incorrect");
}

const workflow = read(".ai/workflows/repository-location-recovery.md");
for (const heading of ["## Use when", "## Inputs", "## Steps", "## Known traps", "## Outputs", "## Stop conditions", "## Proof ceiling"]) {
  if (!workflow.includes(heading)) fail(`recovery workflow missing ${heading}`);
}
for (const marker of [
  "Operator preflight invariant",
  "scripts/ai-harness/operator-preflight.ps1",
  "Invoke-WebRequest -UseBasicParsing",
  "& $t -Fetch -Json",
  "ConvertFrom-Json",
  "never merges, resets, cleans, initializes, or deletes",
]) {
  if (!workflow.includes(marker)) fail(`recovery workflow missing operator-bootstrap contract: ${marker}`);
}

const skill = read(".ai/skills/repository-location-recovery.md");
for (const marker of ["authorityRef: axtask.agent-authority.v1", "skillId: axtask.skill.repository-location-recovery.v1", "## Trigger conditions", "## Required inputs", "## Procedure", "## Expected outputs", "## Safety"]) {
  if (!skill.includes(marker)) fail(`recovery skill missing ${marker}`);
}

const operatorSkill = read(".ai/skills/operator-preflight-bootstrap.md");
for (const marker of ["authorityRef: axtask.agent-authority.v1", "skillId: axtask.skill.operator-preflight-bootstrap.v1", "## Trigger conditions", "## Required inputs", "## Procedure", "## Expected outputs", "## Safety"]) {
  if (!operatorSkill.includes(marker)) fail(`operator preflight skill missing ${marker}`);
}

const report = read(".ai/reports/repository-location-report-template.md");
for (const heading of ["## REPOSITORY", "## OBSERVED LOCATION", "## DISCOVERED CHECKOUTS", "## WORKTREE STATE", "## WORKING", "## BROKEN", "## MISSING", "## SAFETY", "## NEXT ACTION"]) {
  if (!report.includes(heading)) fail(`repository-location report missing ${heading}`);
}

const operatorReport = read(".ai/reports/operator-preflight-report-template.md");
for (const heading of ["## REPOSITORY", "## OBSERVED START", "## WORKING", "## BROKEN", "## MISSING", "## SAFETY", "## NEXT ACTION"]) {
  if (!operatorReport.includes(heading)) fail(`operator-preflight report missing ${heading}`);
}

const bootstrap = read("scripts/ai-harness/operator-preflight.ps1");
for (const marker of [
  "$ExpectedRepository = 'EndeavorEverlasting/AxTask'",
  "Test-CanonicalOrigin",
  "rev-parse','--show-toplevel",
  "remote','get-url','origin",
  "fetch --no-force origin main",
  "No canonical AxTask checkout was found",
  "Do not git init, reset, clean, delete, or overwrite it",
  "[void]$List.Add($full)",
  "scripts\\ai-harness\\resolve-checkout.mjs",
]) {
  if (!bootstrap.includes(marker)) fail(`operator preflight bootstrap missing ${marker}`);
}
if (bootstrap.includes("??")) fail("operator preflight bootstrap must remain parseable by Windows PowerShell 5.1");
for (const forbiddenExit of ["exit 0", "exit 1", "exit 2", "exit $LASTEXITCODE"]) {
  if (bootstrap.includes(forbiddenExit)) fail(`operator preflight bootstrap must not terminate the interactive host with ${forbiddenExit}`);
}
for (const dangerousCommand of ["& git init", "& git reset", "& git clean", "git -C $primary.root init", "git -C $primary.root reset", "git -C $primary.root clean"]) {
  if (bootstrap.includes(dangerousCommand)) fail(`operator preflight bootstrap contains destructive executable pattern: ${dangerousCommand}`);
}

for (const origin of [
  "https://github.com/EndeavorEverlasting/AxTask.git",
  "git@github.com:EndeavorEverlasting/AxTask.git",
  "ssh://git@github.com/EndeavorEverlasting/AxTask.git",
]) {
  if (!isCanonicalOrigin(origin)) fail(`canonical origin was rejected: ${origin}`);
}
for (const origin of [
  "https://evilgithub.com/EndeavorEverlasting/AxTask.git",
  "https://example.test/github.com/EndeavorEverlasting/AxTask.git",
  "git@github.example:EndeavorEverlasting/AxTask.git",
]) {
  if (isCanonicalOrigin(origin)) fail(`non-canonical origin was accepted: ${origin}`);
}

if (process.exitCode) process.exit();

const originalCwd = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-not-a-repo-"));
const fakeAxTask = path.join(scratch, "AxTask");
fs.mkdirSync(fakeAxTask);

try {
  process.chdir(fakeAxTask);
  const result = resolveAxTaskCheckout({
    starts: [fakeAxTask, REPO_ROOT],
    searchRoots: [path.dirname(REPO_ROOT)],
  });
  if (!result.ok) fail(`resolver could not recover from non-repository cwd: ${result.error}`);
  if (result.repository !== "EndeavorEverlasting/AxTask") fail(`unexpected repository identity: ${result.repository}`);
  if (!result.primary || !fs.existsSync(result.primary)) fail("resolver did not return an existing primary checkout");
  if (!Array.isArray(result.worktrees) || result.worktrees.length < 1) fail("resolver did not return Git worktree evidence");
  if (!Array.isArray(result.usableWorktrees) || result.usableWorktrees.length < 1) fail("resolver did not return a usable Git worktree");
  if (result.current !== null) fail("fake AxTask directory was incorrectly accepted as a Git checkout");
} finally {
  process.chdir(originalCwd);
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (!process.exitCode) console.log("[repo-location-recovery] PASS non-repository cwd recovered to canonical AxTask checkout with registered operator bootstrap skill/report contract");
