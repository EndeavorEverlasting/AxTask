#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKTREE_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const WORKSPACE_CONTRACT_PATH = path.join(DEFAULT_WORKTREE_ROOT, ".ai", "agent-workspace-contract.json");
const WORKSPACE_CONTRACT = JSON.parse(fs.readFileSync(WORKSPACE_CONTRACT_PATH, "utf8"));
const DEFAULT_GIT_TIMEOUT_MS = 120_000;
const LOCK_STALE_AFTER_MS = 30 * 60 * 1000;
const LOCK_PARSE_GRACE_MS = 5_000;
export const WORKSPACE_STATUSES = ["ACTIVE", "PRESERVE", "REMOVE"];

function runGit(args, cwd, { allowFailure = false, encoding = "utf8", timeoutMs = DEFAULT_GIT_TIMEOUT_MS } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding,
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(`git ${args.join(" ")} timed out after ${timeoutMs}ms`);
  }
  if (result.error && !allowFailure) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8") : result.stdout;
    throw new Error(`git ${args.join(" ")} failed: ${(stderr || stdout || result.error?.message || "unknown error").trim()}`);
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? (encoding === null ? Buffer.alloc(0) : ""),
    stderr: result.stderr ?? (encoding === null ? Buffer.alloc(0) : ""),
  };
}

export function resolveRepoRoot(cwd = process.cwd()) {
  return path.resolve(runGit(["rev-parse", "--show-toplevel"], cwd).stdout.trim());
}

export function parseWorktreePorcelain(text) {
  const records = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) records.push(current);
      current = { path: line.slice(9), head: null, branch: null, detached: false };
    } else if (current && line.startsWith("HEAD ")) current.head = line.slice(5);
    else if (current && line.startsWith("branch ")) current.branch = line.slice(7).replace(/^refs\/heads\//, "");
    else if (current && line === "detached") current.detached = true;
  }
  if (current) records.push(current);
  return records;
}

export function primaryWorktreePath(worktrees, fallback) {
  return path.resolve(worktrees[0]?.path ?? fallback);
}

export function resolvePrimaryWorktree(cwd = DEFAULT_WORKTREE_ROOT) {
  const worktrees = parseWorktreePorcelain(runGit(["worktree", "list", "--porcelain"], cwd).stdout);
  return primaryWorktreePath(worktrees, resolveRepoRoot(cwd));
}

export function resolveManagedRoot(repoRoot, env = process.env, contract = WORKSPACE_CONTRACT) {
  const override = env.AXTASK_AGENT_WORKSPACE_ROOT?.trim();
  if (override) return path.resolve(override);
  const suffix = contract?.workspaceRoot?.siblingSuffix;
  if (typeof suffix !== "string" || !suffix) throw new Error("workspace contract is missing workspaceRoot.siblingSuffix");
  return path.resolve(path.dirname(repoRoot), `${path.basename(repoRoot)}${suffix}`);
}

function realpath(pathname) {
  return fs.realpathSync.native ? fs.realpathSync.native(pathname) : fs.realpathSync(pathname);
}

export function canonicalizePotentialPath(input) {
  const absolute = path.resolve(input);
  let cursor = absolute;
  const missing = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return absolute;
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.resolve(realpath(cursor), ...missing);
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

export function managedRootProblem(repoRoot, managedRoot, tempRoot = os.tmpdir()) {
  const canonicalRepo = canonicalizePotentialPath(repoRoot);
  const canonicalManaged = canonicalizePotentialPath(managedRoot);
  const canonicalTemp = canonicalizePotentialPath(tempRoot);
  if (isTempLikeWorkspace(canonicalManaged, canonicalTemp)) return "managed workspace root may not be temporary/AppData storage";
  if (isWithinRoot(canonicalManaged, canonicalRepo)) return "managed workspace root may not be inside the repository";
  if (isWithinRoot(canonicalRepo, canonicalManaged)) return "managed workspace root may not contain the primary repository";
  return null;
}

function registryPath(managedRoot, contract = WORKSPACE_CONTRACT) {
  const fileName = contract?.registry?.fileName;
  if (typeof fileName !== "string" || !fileName) throw new Error("workspace contract is missing registry.fileName");
  return path.join(managedRoot, fileName);
}

function lockPath(managedRoot) {
  return path.join(managedRoot, ".axtask-agent-workspaces.lock");
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EPERM") return true;
    return false;
  }
}

function lockState(file) {
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  const ageMs = Math.max(0, Date.now() - stat.mtimeMs);
  let payload = null;
  try { payload = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* fresh writer may not have completed */ }
  const alive = payload ? processAlive(Number(payload.pid)) : ageMs < LOCK_PARSE_GRACE_MS;
  return { payload, ageMs, alive };
}

export function acquireWorkspaceLock(managedRoot, operation = "mutation") {
  fs.mkdirSync(managedRoot, { recursive: true });
  const file = lockPath(managedRoot);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let fd;
    try {
      fd = fs.openSync(file, "wx", 0o600);
      fs.writeFileSync(fd, `${JSON.stringify({ pid: process.pid, operation, createdAt: new Date().toISOString() })}\n`, "utf8");
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        process.off("exit", release);
        try { fs.closeSync(fd); } finally { fs.rmSync(file, { force: true }); }
      };
      process.once("exit", release);
      return release;
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "EEXIST")) throw error;
      const state = lockState(file);
      const stale = state && (!state.alive || state.ageMs > LOCK_STALE_AFTER_MS);
      if (!stale || attempt > 0) throw new Error(`agent workspace registry is locked; another lifecycle mutation may be active: ${file}`);
      console.warn(`[agent-workspaces] removing stale workspace lock age-ms=${Math.round(state.ageMs)} owner-pid=${state.payload?.pid ?? "unknown"}`);
      fs.rmSync(file, { force: true });
    }
  }
  throw new Error(`unable to acquire agent workspace registry lock: ${file}`);
}

function withWorkspaceLock(managedRoot, operation, action) {
  const release = acquireWorkspaceLock(managedRoot, operation);
  try { return action(); }
  finally { release(); }
}

function emptyRegistry(repoRoot, contract = WORKSPACE_CONTRACT) {
  return { schemaVersion: contract.schemaVersion, repository: path.basename(repoRoot), entries: [] };
}

export function readRegistry(managedRoot, repoRoot, contract = WORKSPACE_CONTRACT) {
  const file = registryPath(managedRoot, contract);
  if (!fs.existsSync(file)) return emptyRegistry(repoRoot, contract);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (parsed?.schemaVersion !== contract.schemaVersion || !Array.isArray(parsed.entries)) throw new Error(`invalid workspace registry: ${file}`);
  return parsed;
}

function writeRegistry(managedRoot, registry, contract = WORKSPACE_CONTRACT) {
  fs.mkdirSync(managedRoot, { recursive: true });
  const file = registryPath(managedRoot, contract);
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
  const rootProblem = managedRootProblem(repoRoot, managedRoot, tempRoot);
  if (rootProblem) violations.push({ code: "INVALID_MANAGED_ROOT", path: managedRoot, message: rootProblem, global: true });
  const primaryPath = primaryWorktreePath(worktrees, repoRoot);
  const findEntry = (workspacePath) => registryEntries.find((entry) => samePath(entry.path, workspacePath));

  for (const wt of worktrees) {
    const primary = samePath(wt.path, primaryPath);
    const managed = isWithinRoot(canonicalizePotentialPath(wt.path), canonicalizePotentialPath(managedRoot));
    const entry = findEntry(wt.path);
    const temp = isTempLikeWorkspace(canonicalizePotentialPath(wt.path), canonicalizePotentialPath(tempRoot));
    if (temp && !primary) violations.push({ code: "TEMP_SECONDARY_WORKTREE", path: wt.path, message: "secondary durable worktree is under a temporary/AppData path" });
    if (!primary && !managed) violations.push({ code: "UNMANAGED_SECONDARY_WORKTREE", path: wt.path, message: "secondary worktree is outside the managed workspace root" });
    if (!primary && managed && !entry) violations.push({ code: "MISSING_REGISTRY_ENTRY", path: wt.path, message: "managed secondary worktree is not registered" });
    if (entry && wt.branch && entry.branch !== wt.branch) violations.push({ code: "BRANCH_MISMATCH", path: wt.path, message: `registry branch ${entry.branch} != Git branch ${wt.branch}` });
  }

  for (const entry of registryEntries) {
    if (!WORKSPACE_STATUSES.includes(entry.status)) violations.push({ code: "INVALID_REGISTRY_STATUS", path: entry.path, message: `invalid registry status ${entry.status}` });
    if (!worktrees.some((wt) => samePath(wt.path, entry.path))) violations.push({ code: "REGISTRY_WITHOUT_WORKTREE", path: entry.path, message: "registry entry has no matching Git worktree" });
    if (!isWithinRoot(canonicalizePotentialPath(entry.path), canonicalizePotentialPath(managedRoot))) violations.push({ code: "REGISTRY_OUTSIDE_MANAGED_ROOT", path: entry.path, message: "registry entry points outside managed root" });
    if (isTempLikeWorkspace(canonicalizePotentialPath(entry.path), canonicalizePotentialPath(tempRoot))) violations.push({ code: "REGISTRY_IN_TEMP", path: entry.path, message: "registry points into temporary/AppData storage" });
  }

  for (const dir of diskDirs) if (!worktrees.some((wt) => samePath(wt.path, dir))) warnings.push({ code: "ORPHAN_DIRECTORY", path: dir, message: "directory under managed root is not a registered Git worktree" });
  const currentViolations = violations.filter((item) => item.global || (item.path && samePath(item.path, currentPath)));
  return { primaryPath, violations, warnings, currentViolations };
}

function splitNulls(value) {
  return String(value).split("\0").filter(Boolean);
}

function normalizeCrLf(buffer) {
  const out = [];
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 13 && buffer[index + 1] === 10) continue;
    out.push(buffer[index]);
  }
  return Buffer.from(out);
}

export function buffersDifferOnlyByLineEndings(a, b) {
  return normalizeCrLf(a).equals(normalizeCrLf(b));
}

export function inspectWorkspaceCleanliness(workspacePath, repoRoot = workspacePath) {
  const staged = splitNulls(runGit(["-C", workspacePath, "diff", "--cached", "--name-only", "-z"], repoRoot).stdout);
  const untracked = splitNulls(runGit(["-C", workspacePath, "ls-files", "--others", "--exclude-standard", "-z"], repoRoot).stdout);
  const unstaged = splitNulls(runGit(["-C", workspacePath, "diff", "--name-only", "-z"], repoRoot).stdout);
  const lineEndingOnly = [];
  const semanticTracked = [];

  for (const relativePath of unstaged) {
    const attribute = runGit(["-C", workspacePath, "check-attr", "text", "--", relativePath], repoRoot, { allowFailure: true });
    const explicitlyText = attribute.status === 0 && /: text: set\s*$/.test(attribute.stdout.trim());
    const absolutePath = path.join(workspacePath, relativePath);
    const head = runGit(["-C", workspacePath, "show", `HEAD:${relativePath}`], repoRoot, { allowFailure: true, encoding: null });
    if (explicitlyText && head.status === 0 && fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile() && buffersDifferOnlyByLineEndings(head.stdout, fs.readFileSync(absolutePath))) lineEndingOnly.push(relativePath);
    else semanticTracked.push(relativePath);
  }

  const semanticallyClean = staged.length === 0 && untracked.length === 0 && semanticTracked.length === 0;
  return { semanticallyClean, staged, untracked, semanticTracked, lineEndingOnly };
}

export function assessDeletionEligibility({ status, primary, clean, merged, detached = false, branchMatches = true }) {
  if (status !== "REMOVE") return { safe: false, reason: "workspace status is not REMOVE" };
  if (primary) return { safe: false, reason: "primary worktree is never removed by the agent workspace helper" };
  if (detached) return { safe: false, reason: "detached worktrees are preserved for manual inspection" };
  if (!branchMatches) return { safe: false, reason: "registered branch does not match checked-out branch" };
  if (!clean) return { safe: false, reason: "worktree has staged, untracked, or semantic tracked changes" };
  if (!merged) return { safe: false, reason: "workspace HEAD is not an ancestor of origin/main" };
  return { safe: true, reason: "semantically clean named secondary worktree is merged into origin/main" };
}

function currentState(repoRoot, managedRoot) {
  const worktrees = parseWorktreePorcelain(runGit(["worktree", "list", "--porcelain"], DEFAULT_WORKTREE_ROOT).stdout);
  const currentPath = resolveRepoRoot(DEFAULT_WORKTREE_ROOT);
  const registry = readRegistry(managedRoot, repoRoot);
  return { worktrees, currentPath, registry, diskDirs: diskDirectories(managedRoot) };
}

function deletionForEntry(repoRoot, worktrees, entry) {
  const primaryPath = primaryWorktreePath(worktrees, repoRoot);
  const wt = worktrees.find((item) => samePath(item.path, entry.path));
  if (!wt) return { safe: false, reason: "no matching Git worktree", cleanliness: null };
  const cleanliness = inspectWorkspaceCleanliness(entry.path, repoRoot);
  const branchResult = runGit(["-C", entry.path, "symbolic-ref", "--quiet", "--short", "HEAD"], repoRoot, { allowFailure: true });
  const mergedResult = runGit(["-C", entry.path, "merge-base", "--is-ancestor", "HEAD", "origin/main"], repoRoot, { allowFailure: true });
  return {
    ...assessDeletionEligibility({
      status: entry.status,
      primary: samePath(entry.path, primaryPath),
      clean: cleanliness.semanticallyClean,
      merged: mergedResult.status === 0,
      detached: branchResult.status !== 0,
      branchMatches: branchResult.status === 0 && branchResult.stdout.trim() === entry.branch,
    }),
    cleanliness,
  };
}

export function worktreeAddPlan({ branch, workspacePath, baseRef, localBranchExists, remoteBranchExists }) {
  if (localBranchExists) return { args: ["worktree", "add", workspacePath, branch], sourceRef: branch, createdBranch: false };
  if (remoteBranchExists) return { args: ["worktree", "add", "-b", branch, workspacePath, `origin/${branch}`], sourceRef: `origin/${branch}`, createdBranch: true };
  return { args: ["worktree", "add", "-b", branch, workspacePath, baseRef], sourceRef: baseRef, createdBranch: true };
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

function flag(options, key) {
  const value = options[key];
  return value === true || value === "true" || value === "1";
}

function safeSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "workspace";
}

function printDoctor(result, mode, json) {
  if (json) { console.log(JSON.stringify({ mode, ...result }, null, 2)); return; }
  console.log(`[agent-workspaces] mode=${mode} violations=${result.violations.length} warnings=${result.warnings.length}`);
  for (const item of result.violations) console.log(`VIOLATION ${item.code}: ${item.message} :: ${item.path}`);
  for (const item of result.warnings) console.log(`WARNING ${item.code}: ${item.message} :: ${item.path}`);
}

function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0] ?? "list";
  const repoRoot = resolvePrimaryWorktree(DEFAULT_WORKTREE_ROOT);
  const managedRoot = resolveManagedRoot(repoRoot);
  const rootProblem = managedRootProblem(repoRoot, managedRoot);
  if (rootProblem) throw new Error(`${rootProblem}: ${managedRoot}`);

  if (command === "root") { console.log(managedRoot); return; }

  if (command === "doctor" || command === "list") {
    const state = currentState(repoRoot, managedRoot);
    const diagnosis = diagnoseWorkspaces({ repoRoot, managedRoot, currentPath: state.currentPath, worktrees: state.worktrees, registryEntries: state.registry.entries, diskDirs: state.diskDirs });
    const json = flag(options, "json");
    if (command === "doctor") {
      const strictAll = flag(options, "strict-all");
      const strictCurrent = flag(options, "strict-current") || !strictAll;
      printDoctor(diagnosis, strictAll ? "strict-all" : "strict-current", json);
      const failing = strictAll ? diagnosis.violations : strictCurrent ? diagnosis.currentViolations : [];
      if (failing.length) process.exitCode = 1;
      return;
    }
    const items = state.registry.entries.map((entry) => ({ ...entry, deletion: deletionForEntry(repoRoot, state.worktrees, entry) }));
    if (json) console.log(JSON.stringify({ managedRoot, worktrees: state.worktrees, registry: items, diagnosis }, null, 2));
    else {
      console.log(`AXTASK AGENT WORKSPACES\nmanaged-root: ${managedRoot}`);
      for (const status of WORKSPACE_STATUSES) {
        console.log(`\n${status}`);
        const selected = items.filter((item) => item.status === status);
        if (!selected.length) console.log("  (none)");
        for (const item of selected) {
          const eol = item.deletion.cleanliness?.lineEndingOnly?.length ? ` | eol-noise=${item.deletion.cleanliness.lineEndingOnly.length}` : "";
          console.log(`  ${item.id} | ${item.branch} | safe-to-remove=${item.deletion.safe ? "YES" : "NO"} | ${item.deletion.reason}${eol}`);
        }
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
    runGit(["check-ref-format", "--branch", branch], repoRoot);
    return withWorkspaceLock(managedRoot, `create:${branch}`, () => {
      const state = currentState(repoRoot, managedRoot);
      if (state.worktrees.some((wt) => wt.branch === branch)) throw new Error(`branch is already checked out in another worktree: ${branch}`);
      const id = `${safeSlug(taskId)}-${safeSlug(branch)}`;
      const workspacePath = path.join(managedRoot, id);
      if (fs.existsSync(workspacePath)) throw new Error(`workspace path already exists: ${workspacePath}`);
      const localBranchExists = runGit(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], repoRoot, { allowFailure: true }).status === 0;
      const remoteBranchExists = runGit(["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`], repoRoot, { allowFailure: true }).status === 0;
      const plan = worktreeAddPlan({ branch, workspacePath, baseRef, localBranchExists, remoteBranchExists });
      const baseSha = runGit(["rev-parse", plan.sourceRef], repoRoot).stdout.trim();
      runGit(plan.args, repoRoot);
      const cleanliness = inspectWorkspaceCleanliness(workspacePath, repoRoot);
      const next = readRegistry(managedRoot, repoRoot);
      const status = cleanliness.semanticallyClean ? "ACTIVE" : "PRESERVE";
      const reason = cleanliness.semanticallyClean
        ? (cleanliness.lineEndingOnly.length ? `checkout has ${cleanliness.lineEndingOnly.length} proven line-ending-only tracked differences` : undefined)
        : "checkout produced staged, untracked, or semantic tracked differences; preserved for inspection";
      next.entries.push({ id, taskId, owner, path: workspacePath, branch, baseRef: plan.sourceRef, baseSha, purpose, createdAt: new Date().toISOString(), status, ...(reason ? { reason } : {}) });
      writeRegistry(managedRoot, next);
      if (!cleanliness.semanticallyClean) throw new Error(`created workspace ${id} is not semantically clean and was registered PRESERVE; inspect before use`);
      console.log(`[agent-workspaces] CREATED id=${id} branch=${branch} path=${workspacePath} existing-branch=${localBranchExists ? "yes" : "no"} eol-noise=${cleanliness.lineEndingOnly.length}`);
    });
  }

  if (command === "classify") {
    const id = requiredOption(options, "id");
    const status = requiredOption(options, "status").toUpperCase();
    if (!WORKSPACE_STATUSES.includes(status)) throw new Error(`--status must be one of ${WORKSPACE_STATUSES.join(", ")}`);
    return withWorkspaceLock(managedRoot, `classify:${id}`, () => {
      const registry = readRegistry(managedRoot, repoRoot);
      const entry = registry.entries.find((item) => item.id === id);
      if (!entry) throw new Error(`unknown workspace id: ${id}`);
      entry.status = status;
      entry.updatedAt = new Date().toISOString();
      if (typeof options.reason === "string" && options.reason.trim()) entry.reason = options.reason.trim();
      writeRegistry(managedRoot, registry);
      console.log(`[agent-workspaces] CLASSIFIED id=${id} status=${status}`);
    });
  }

  if (command === "cleanup") {
    const id = requiredOption(options, "id");
    return withWorkspaceLock(managedRoot, `cleanup:${id}`, () => {
      runGit(["fetch", "--no-tags", "origin", "main"], repoRoot);
      let state = currentState(repoRoot, managedRoot);
      let entry = state.registry.entries.find((item) => item.id === id);
      if (!entry) throw new Error(`unknown workspace id: ${id}`);
      let eligibility = deletionForEntry(repoRoot, state.worktrees, entry);
      if (!eligibility.safe) throw new Error(`refusing cleanup for ${id}: ${eligibility.reason}`);
      const expectedHead = runGit(["-C", entry.path, "rev-parse", "HEAD"], repoRoot).stdout.trim();
      const expectedBranch = runGit(["-C", entry.path, "symbolic-ref", "--quiet", "--short", "HEAD"], repoRoot).stdout.trim();
      const expectedEolNoise = eligibility.cleanliness?.lineEndingOnly ?? [];

      state = currentState(repoRoot, managedRoot);
      entry = state.registry.entries.find((item) => item.id === id);
      if (!entry) throw new Error(`workspace registry changed during cleanup: ${id}`);
      eligibility = deletionForEntry(repoRoot, state.worktrees, entry);
      const currentHead = runGit(["-C", entry.path, "rev-parse", "HEAD"], repoRoot).stdout.trim();
      const currentBranch = runGit(["-C", entry.path, "symbolic-ref", "--quiet", "--short", "HEAD"], repoRoot, { allowFailure: true }).stdout.trim();
      if (!eligibility.safe) throw new Error(`refusing cleanup after recheck for ${id}: ${eligibility.reason}`);
      if (currentHead !== expectedHead || currentBranch !== expectedBranch) throw new Error(`refusing cleanup for ${id}: HEAD or branch changed during safety check`);
      if (JSON.stringify(eligibility.cleanliness?.lineEndingOnly ?? []) !== JSON.stringify(expectedEolNoise)) throw new Error(`refusing cleanup for ${id}: line-ending-only noise set changed during safety check`);

      const removeArgs = expectedEolNoise.length ? ["worktree", "remove", "--force", entry.path] : ["worktree", "remove", entry.path];
      runGit(removeArgs, repoRoot);
      runGit(["worktree", "prune"], repoRoot);
      state.registry.entries = state.registry.entries.filter((item) => item.id !== id);
      writeRegistry(managedRoot, state.registry);
      console.log(`[agent-workspaces] REMOVED id=${id}; branch preserved=${entry.branch}; verified-head=${expectedHead}; eol-noise-discarded=${expectedEolNoise.length}`);
    });
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
