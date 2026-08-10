#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
export const WORKSPACE_STATUSES = ["ACTIVE", "PRESERVE", "REMOVE"];

function runGit(args, cwd, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function resolveRepoRoot(cwd = process.cwd()) {
  const result = runGit(["rev-parse", "--show-toplevel"], cwd);
  return path.resolve(result.stdout.trim());
}

export function resolveManagedRoot(repoRoot, env = process.env) {
  const override = env.AXTASK_AGENT_WORKSPACE_ROOT?.trim();
  if (override) return path.resolve(override);
  return path.resolve(path.dirname(repoRoot), `${path.basename(repoRoot)}-worktrees`);
}

function comparable(input) {
  const resolved = path.resolve(input);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function samePath(a, b) {
  return comparable(a) === comparable(b);
}

export function isWithinRoot(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function slashLower(value) {
  return String(value).replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
}

export function isTempLikeWorkspace(candidate, tempRoot = os.tmpdir()) {
  const value = slashLower(candidate);
  const temp = slashLower(tempRoot);
  if (temp && (value === temp || value.startsWith(`${temp}/`))) return true;
  if (value.includes("/appdata/local/temp/") || value.endsWith("/appdata/local/temp")) return true;
  return value === "/tmp" || value.startsWith("/tmp/") || value === "/var/tmp" || value.startsWith("/var/tmp/");
}

export function parseWorktreePorcelain(text) {
  const records = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) records.push(current);
      current = { path: line.slice(9), head: null, branch: null, detached: false };
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice(5);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice(7).replace(/^refs\/heads\//, "");
    } else if (current && line === "detached") {
      current.detached = true;
    }
  }
  if (current) records.push(current);
  return records;
}

function registryPath(managedRoot) {
  return path.join(managedRoot, ".axtask-agent-workspaces.json");
}

function emptyRegistry(repoRoot) {
  return { schemaVersion: 1, repository: path.basename(repoRoot), entries: [] };
}

export function readRegistry(managedRoot, repoRoot) {
  const file = registryPath(managedRoot);
  if (!fs.existsSync(file)) return emptyRegistry(repoRoot);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.entries)) throw new Error(`invalid workspace registry: ${file}`);
  return parsed;
}

function writeRegistry(managedRoot, registry) {
  fs.mkdirSync(managedRoot, { recursive: true });
  const file = registryPath(managedRoot);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function diskDirectories(managedRoot) {
  if (!fs.existsSync(managedRoot)) return [];
  return fs.readdirSync(managedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(managedRoot, entry.name));
}

export function diagnoseWorkspaces({ repoRoot, managedRoot, currentPath, worktrees, registryEntries, diskDirs, tempRoot = os.tmpdir() }) {
  const violations = [];
  const warnings = [];
  const primaryPath = worktrees[0]?.path ?? repoRoot;
  const findEntry = (workspacePath) => registryEntries.find((entry) => samePath(entry.path, workspacePath));

  for (const wt of worktrees) {
    const primary = samePath(wt.path, primaryPath);
    const managed = isWithinRoot(wt.path, managedRoot);
    const entry = findEntry(wt.path);
    const temp = isTempLikeWorkspace(wt.path, tempRoot);
    if (temp && !primary) violations.push({ code: "TEMP_SECONDARY_WORKTREE", path: wt.path, message: "secondary durable worktree is under a temporary/AppData path" });
    if (!primary && !managed) violations.push({ code: "UNMANAGED_SECONDARY_WORKTREE", path: wt.path, message: "secondary worktree is outside the managed workspace root" });
    if (!primary && managed && !entry) violations.push({ code: "MISSING_REGISTRY_ENTRY", path: wt.path, message: "managed secondary worktree is not registered" });
    if (entry && wt.branch && entry.branch !== wt.branch) violations.push({ code: "BRANCH_MISMATCH", path: wt.path, message: `registry branch ${entry.branch} != Git branch ${wt.branch}` });
  }

  for (const entry of registryEntries) {
    if (!WORKSPACE_STATUSES.includes(entry.status)) violations.push({ code: "INVALID_REGISTRY_STATUS", path: entry.path, message: `invalid registry status ${entry.status}` });
    if (!worktrees.some((wt) => samePath(wt.path, entry.path))) violations.push({ code: "REGISTRY_WITHOUT_WORKTREE", path: entry.path, message: "registry entry has no matching Git worktree" });
    if (!isWithinRoot(entry.path, managedRoot)) violations.push({ code: "REGISTRY_OUTSIDE_MANAGED_ROOT", path: entry.path, message: "registry entry points outside managed root" });
    if (isTempLikeWorkspace(entry.path, tempRoot)) violations.push({ code: "REGISTRY_IN_TEMP", path: entry.path, message: "registry points into temporary/AppData storage" });
  }

  for (const dir of diskDirs) {
    if (!worktrees.some((wt) => samePath(wt.path, dir))) warnings.push({ code: "ORPHAN_DIRECTORY", path: dir, message: "directory under managed root is not a registered Git worktree" });
  }

  const currentViolations = violations.filter((item) => item.path && samePath(item.path, currentPath));
  return { primaryPath, violations, warnings, currentViolations };
}

export function assessDeletionEligibility({ status, primary, clean, merged }) {
  if (status !== "REMOVE") return { safe: false, reason: "workspace status is not REMOVE" };
  if (primary) return { safe: false, reason: "primary worktree is never removed by the agent workspace helper" };
  if (!clean) return { safe: false, reason: "worktree has uncommitted or untracked changes" };
  if (!merged) return { safe: false, reason: "workspace HEAD is not an ancestor of origin/main" };
  return { safe: true, reason: "clean secondary worktree is merged into origin/main" };
}

function currentState(repoRoot, managedRoot) {
  const worktrees = parseWorktreePorcelain(runGit(["worktree", "list", "--porcelain"], repoRoot).stdout);
  const currentPath = resolveRepoRoot(process.cwd());
  const registry = readRegistry(managedRoot, repoRoot);
  return { worktrees, currentPath, registry, diskDirs: diskDirectories(managedRoot) };
}

function deletionForEntry(repoRoot, worktrees, entry) {
  const primaryPath = worktrees[0]?.path ?? repoRoot;
  const wt = worktrees.find((item) => samePath(item.path, entry.path));
  if (!wt) return { safe: false, reason: "no matching Git worktree" };
  const status = runGit(["-C", entry.path, "status", "--porcelain"], repoRoot, { allowFailure: true });
  const clean = status.status === 0 && status.stdout.trim() === "";
  const mergedResult = runGit(["-C", entry.path, "merge-base", "--is-ancestor", "HEAD", "origin/main"], repoRoot, { allowFailure: true });
  return assessDeletionEligibility({ status: entry.status, primary: samePath(entry.path, primaryPath), clean, merged: mergedResult.status === 0 });
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const [rawKey, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) options[rawKey] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) options[rawKey] = argv[++i];
    else options[rawKey] = true;
  }
  return { positional, options };
}

function requiredOption(options, key) {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`--${key} is required`);
  return value.trim();
}

function safeSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "workspace";
}

function printDoctor(result, mode, json) {
  if (json) {
    console.log(JSON.stringify({ mode, ...result }, null, 2));
    return;
  }
  console.log(`[agent-workspaces] mode=${mode} violations=${result.violations.length} warnings=${result.warnings.length}`);
  for (const item of result.violations) console.log(`VIOLATION ${item.code}: ${item.message} :: ${item.path}`);
  for (const item of result.warnings) console.log(`WARNING ${item.code}: ${item.message} :: ${item.path}`);
}

function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0] ?? "list";
  const repoRoot = resolveRepoRoot(DEFAULT_REPO_ROOT);
  const managedRoot = resolveManagedRoot(repoRoot);

  if (command === "root") {
    console.log(managedRoot);
    return;
  }

  const state = currentState(repoRoot, managedRoot);
  const diagnosis = diagnoseWorkspaces({ repoRoot, managedRoot, currentPath: state.currentPath, worktrees: state.worktrees, registryEntries: state.registry.entries, diskDirs: state.diskDirs });

  if (command === "doctor") {
    const strictAll = options["strict-all"] === true;
    const strictCurrent = options["strict-current"] === true || !strictAll;
    printDoctor(diagnosis, strictAll ? "strict-all" : "strict-current", options.json === true);
    const failing = strictAll ? diagnosis.violations : strictCurrent ? diagnosis.currentViolations : [];
    if (failing.length) process.exitCode = 1;
    return;
  }

  if (command === "list") {
    const items = state.registry.entries.map((entry) => ({ ...entry, deletion: deletionForEntry(repoRoot, state.worktrees, entry) }));
    if (options.json === true) console.log(JSON.stringify({ managedRoot, worktrees: state.worktrees, registry: items, diagnosis }, null, 2));
    else {
      console.log(`AXTASK AGENT WORKSPACES\nmanaged-root: ${managedRoot}`);
      for (const status of WORKSPACE_STATUSES) {
        console.log(`\n${status}`);
        const selected = items.filter((item) => item.status === status);
        if (!selected.length) console.log("  (none)");
        for (const item of selected) console.log(`  ${item.id} | ${item.branch} | safe-to-remove=${item.deletion.safe ? "YES" : "NO"} | ${item.deletion.reason}`);
      }
      if (diagnosis.violations.length) {
        console.log("\nUNMANAGED / UNSAFE");
        for (const item of diagnosis.violations) console.log(`  ${item.code}: ${item.path}`);
      }
    }
    return;
  }

  if (command === "create") {
    const taskId = requiredOption(options, "task");
    const owner = requiredOption(options, "owner");
    const branch = requiredOption(options, "branch");
    const purpose = requiredOption(options, "purpose");
    const baseRef = typeof options.base === "string" ? options.base : "origin/main";
    if (isTempLikeWorkspace(managedRoot)) throw new Error(`managed workspace root may not be temporary: ${managedRoot}`);
    fs.mkdirSync(managedRoot, { recursive: true });
    const id = `${safeSlug(taskId)}-${safeSlug(branch)}`;
    const workspacePath = path.join(managedRoot, id);
    if (fs.existsSync(workspacePath)) throw new Error(`workspace path already exists: ${workspacePath}`);
    if (state.worktrees.some((wt) => wt.branch === branch)) throw new Error(`branch is already checked out in another worktree: ${branch}`);
    const baseSha = runGit(["rev-parse", baseRef], repoRoot).stdout.trim();
    runGit(["worktree", "add", "-b", branch, workspacePath, baseRef], repoRoot);
    const next = readRegistry(managedRoot, repoRoot);
    next.entries.push({ id, taskId, owner, path: workspacePath, branch, baseRef, baseSha, purpose, createdAt: new Date().toISOString(), status: "ACTIVE" });
    try { writeRegistry(managedRoot, next); }
    catch (error) {
      runGit(["worktree", "remove", workspacePath], repoRoot, { allowFailure: true });
      throw error;
    }
    console.log(`[agent-workspaces] CREATED id=${id} branch=${branch} path=${workspacePath}`);
    return;
  }

  if (command === "classify") {
    const id = requiredOption(options, "id");
    const status = requiredOption(options, "status").toUpperCase();
    if (!WORKSPACE_STATUSES.includes(status)) throw new Error(`--status must be one of ${WORKSPACE_STATUSES.join(", ")}`);
    const registry = readRegistry(managedRoot, repoRoot);
    const entry = registry.entries.find((item) => item.id === id);
    if (!entry) throw new Error(`unknown workspace id: ${id}`);
    entry.status = status;
    entry.updatedAt = new Date().toISOString();
    if (typeof options.reason === "string" && options.reason.trim()) entry.reason = options.reason.trim();
    writeRegistry(managedRoot, registry);
    console.log(`[agent-workspaces] CLASSIFIED id=${id} status=${status}`);
    return;
  }

  if (command === "cleanup") {
    const id = requiredOption(options, "id");
    const registry = readRegistry(managedRoot, repoRoot);
    const entry = registry.entries.find((item) => item.id === id);
    if (!entry) throw new Error(`unknown workspace id: ${id}`);
    const eligibility = deletionForEntry(repoRoot, state.worktrees, entry);
    if (!eligibility.safe) throw new Error(`refusing cleanup for ${id}: ${eligibility.reason}`);
    runGit(["worktree", "remove", entry.path], repoRoot);
    runGit(["worktree", "prune"], repoRoot);
    registry.entries = registry.entries.filter((item) => item.id !== id);
    writeRegistry(managedRoot, registry);
    console.log(`[agent-workspaces] REMOVED id=${id}; branch preserved=${entry.branch}`);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) {
    console.error(`[agent-workspaces] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
