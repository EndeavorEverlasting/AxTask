#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isCanonicalOrigin, resolveAxTaskCheckout } from "./resolve-checkout.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const REQUIRED_FILES = [
  ".ai/README.md",
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

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr ?? result.stdout ?? "").trim()}`);
  }
  return String(result.stdout ?? "").trim();
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
  "Repository identity is not artifact availability",
  "prove that the required path exists at the selected checkout HEAD",
  "`git fetch` updates remote-tracking refs; it does not update the working tree",
  "isolated worktree at that exact SHA",
  "scripts/ai-harness/operator-preflight.ps1",
  "Invoke-WebRequest -UseBasicParsing",
  "-Fetch -EnsureArtifactWorktree -Json",
  "$r.requiredArtifactAvailable",
  "$r.selected",
  "never merges, resets, cleans, initializes, deletes, or overwrites",
]) {
  if (!workflow.includes(marker)) fail(`recovery workflow missing operator-bootstrap contract: ${marker}`);
}
const rawBootstrap = workflow.match(/```powershell\n([\s\S]*?)```/)?.[1] ?? "";
if (!rawBootstrap) fail("recovery workflow missing raw PowerShell bootstrap block");
if (rawBootstrap.includes("Set-Location -LiteralPath $r.primary")) {
  fail("raw bootstrap must not enter the discovered primary checkout before artifact-availability gating");
}
if (!rawBootstrap.includes("Set-Location -LiteralPath $r.selected")) {
  fail("raw bootstrap must enter only the artifact-capable selected checkout");
}

const readme = read(".ai/README.md");
for (const marker of [
  "operator-preflight.ps1",
  "-Fetch -EnsureArtifactWorktree -Json",
  "requiredArtifactAvailable",
  "Set-Location -LiteralPath $r.selected",
  "`primary` is only the first canonical checkout discovered; use `selected` for tracked-artifact execution",
]) {
  if (!readme.includes(marker)) fail(`harness README missing fresh-agent recovery marker: ${marker}`);
}
if (readme.includes("axtask-resolve-checkout.mjs'; Invoke-WebRequest")) {
  fail("harness README must not bootstrap the resolver directly from an unproven checkout flow");
}

const skill = read(".ai/skills/repository-location-recovery.md");
for (const marker of ["authorityRef: axtask.agent-authority.v1", "skillId: axtask.skill.repository-location-recovery.v1", "## Trigger conditions", "## Required inputs", "## Procedure", "## Expected outputs", "## Safety"]) {
  if (!skill.includes(marker)) fail(`recovery skill missing ${marker}`);
}

const operatorSkill = read(".ai/skills/operator-preflight-bootstrap.md");
for (const marker of [
  "authorityRef: axtask.agent-authority.v1",
  "skillId: axtask.skill.operator-preflight-bootstrap.v1",
  "## Trigger conditions",
  "## Required inputs",
  "## Procedure",
  "-Fetch -EnsureArtifactWorktree",
  "requiredArtifactAvailable",
  "Use `selected`, not `primary`",
  "## Expected outputs",
  "## Safety",
]) {
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
  "[switch]$EnsureArtifactWorktree",
  "$RequiredArtifact = 'scripts/ai-harness/resolve-checkout.mjs'",
  "Test-CanonicalOrigin",
  "Test-ArtifactAtRef",
  "rev-parse','--show-toplevel",
  "remote','get-url','origin",
  "fetch --no-force origin main",
  "worktree add --detach",
  "requiredArtifactAvailable",
  "selected = $selected.root",
  "Re-run this bootstrap with -Fetch -EnsureArtifactWorktree -Json",
  "No canonical AxTask checkout was found",
  "Do not git init, reset, clean, delete, or overwrite it",
  "[void]$List.Add($full)",
]) {
  if (!bootstrap.includes(marker)) fail(`operator preflight bootstrap missing ${marker}`);
}
if (bootstrap.includes("??")) fail("operator preflight bootstrap must remain parseable by Windows PowerShell 5.1");
if (/^\s*exit(?:\s+(?:0|1|2|\$LASTEXITCODE))?\s*(?:#.*)?$/im.test(bootstrap)) {
  fail("operator preflight bootstrap must not terminate the interactive host with an exit command");
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

const staleScratch = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-stale-checkout-"));
const staleRepo = path.join(staleScratch, "AxTask-stale");
const requiredArtifact = "scripts/ai-harness/resolve-checkout.mjs";

try {
  fs.mkdirSync(staleRepo);
  git(["init"], staleRepo);
  git(["config", "user.email", "harness@example.invalid"], staleRepo);
  git(["config", "user.name", "AxTask Harness"], staleRepo);
  git(["remote", "add", "origin", "https://github.com/EndeavorEverlasting/AxTask.git"], staleRepo);

  fs.writeFileSync(path.join(staleRepo, "README.md"), "stale fixture\n", "utf8");
  git(["add", "README.md"], staleRepo);
  git(["commit", "-m", "fixture: stale checkout"], staleRepo);
  const staleHead = git(["rev-parse", "HEAD"], staleRepo);

  const artifactPath = path.join(staleRepo, requiredArtifact);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, "export const fixtureArtifact = true;\n", "utf8");
  git(["add", requiredArtifact], staleRepo);
  git(["commit", "-m", "fixture: add required artifact"], staleRepo);
  const intendedHead = git(["rev-parse", "HEAD"], staleRepo);
  git(["update-ref", "refs/remotes/origin/main", intendedHead], staleRepo);
  git(["checkout", "--detach", staleHead], staleRepo);

  const resolved = resolveAxTaskCheckout({ starts: [staleRepo], searchRoots: [] });
  if (!resolved.ok) fail(`stale canonical checkout was not recognized: ${resolved.error}`);
  if (resolved.head !== staleHead) fail(`stale fixture resolved unexpected HEAD: ${resolved.head}`);
  if (fs.existsSync(path.join(staleRepo, requiredArtifact))) fail("stale checkout unexpectedly contains required artifact");

  const atStaleHead = spawnSync("git", ["-C", staleRepo, "cat-file", "-e", `${staleHead}:${requiredArtifact}`], { encoding: "utf8", windowsHide: true });
  if (atStaleHead.status === 0) fail("canonical repository identity incorrectly implied artifact availability at stale HEAD");

  const atIntendedHead = spawnSync("git", ["-C", staleRepo, "cat-file", "-e", `${intendedHead}:${requiredArtifact}`], { encoding: "utf8", windowsHide: true });
  if (atIntendedHead.status !== 0) fail("intended remote SHA does not contain required artifact in stale-checkout fixture");

  const exactWorktree = path.join(staleScratch, "exact-target");
  git(["worktree", "add", "--detach", exactWorktree, intendedHead], staleRepo);
  if (!fs.existsSync(path.join(exactWorktree, requiredArtifact))) fail("exact-target isolated worktree did not expose required artifact");
} catch (error) {
  fail(`stale-checkout artifact fixture failed: ${error.message}`);
} finally {
  fs.rmSync(staleScratch, { recursive: true, force: true });
}

if (!process.exitCode) console.log("[repo-location-recovery] PASS non-repository cwd recovery plus stale-checkout artifact gating with artifact-capable operator bootstrap contract");
