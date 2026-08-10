#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const EXPECTED_REPOSITORY = "EndeavorEverlasting/AxTask";
const DEFAULT_TIMEOUT_MS = 20_000;

function git(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: DEFAULT_TIMEOUT_MS,
    windowsHide: true,
  });
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim(),
  };
}

function canonical(input) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(input) : fs.realpathSync(input);
  } catch {
    return path.resolve(input);
  }
}

function key(input) {
  const value = path.resolve(input);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function addUnique(list, seen, input) {
  if (!input || typeof input !== "string") return;
  const resolved = path.resolve(input);
  const id = key(resolved);
  if (seen.has(id)) return;
  seen.add(id);
  list.push(resolved);
}

function parseArgs(argv) {
  const parsed = { starts: [], searchRoots: [], json: false, printPath: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--start") parsed.starts.push(argv[++index]);
    else if (arg === "--search-root") parsed.searchRoots.push(argv[++index]);
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--print-path") parsed.printPath = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

export function isCanonicalOrigin(origin) {
  const value = String(origin ?? "").trim().replace(/\.git$/i, "");
  return (
    /^https:\/\/github\.com\/EndeavorEverlasting\/AxTask$/i.test(value) ||
    /^git@github\.com:EndeavorEverlasting\/AxTask$/i.test(value) ||
    /^ssh:\/\/git@github\.com\/EndeavorEverlasting\/AxTask$/i.test(value)
  );
}

function probe(candidate) {
  if (!candidate || !fs.existsSync(candidate)) return null;
  const top = git(["-C", candidate, "rev-parse", "--show-toplevel"], candidate);
  if (top.status !== 0 || !top.stdout) return null;
  const root = canonical(top.stdout);
  const origin = git(["-C", root, "remote", "get-url", "origin"], root);
  if (origin.status !== 0 || !isCanonicalOrigin(origin.stdout)) return null;
  const head = git(["-C", root, "rev-parse", "HEAD"], root);
  const branch = git(["-C", root, "branch", "--show-current"], root);
  return {
    root,
    origin: origin.stdout,
    head: head.status === 0 ? head.stdout : null,
    branch: branch.status === 0 && branch.stdout ? branch.stdout : null,
  };
}

function parseWorktrees(text) {
  const rows = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) rows.push(current);
      current = { path: canonical(line.slice(9)), head: null, branch: null, detached: false, prunable: false };
    } else if (current && line.startsWith("HEAD ")) current.head = line.slice(5);
    else if (current && line.startsWith("branch refs/heads/")) current.branch = line.slice("branch refs/heads/".length);
    else if (current && line === "detached") current.detached = true;
    else if (current && line.startsWith("prunable")) current.prunable = true;
  }
  if (current) rows.push(current);
  return rows;
}

function shallowDirectories(root) {
  if (!root || !fs.existsSync(root)) return [];
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

function defaultPaths() {
  const home = os.homedir();
  return {
    starts: [
      process.cwd(),
      path.join(home, "Desktop", "Dev", "AxTask"),
      path.join(home, "Desktop", "dev", "AxTask"),
      path.join(home, "dev", "AxTask"),
    ],
    searchRoots: [
      path.join(home, "Desktop", "Dev"),
      path.join(home, "Desktop", "dev"),
      path.join(home, "dev"),
      path.dirname(process.cwd()),
    ],
  };
}

export function resolveAxTaskCheckout(options = {}) {
  const defaults = defaultPaths();
  const direct = [];
  const directSeen = new Set();
  for (const item of [...(options.starts ?? []), ...defaults.starts]) addUnique(direct, directSeen, item);

  const searchRoots = [];
  const rootSeen = new Set();
  for (const item of [...(options.searchRoots ?? []), ...defaults.searchRoots]) addUnique(searchRoots, rootSeen, item);

  const candidates = [...direct];
  const candidateSeen = new Set(candidates.map(key));

  for (const root of searchRoots) {
    for (const child of shallowDirectories(root)) {
      addUnique(candidates, candidateSeen, child);
      const name = path.basename(child).toLowerCase();
      if (name === "axtask-worktrees" || name.startsWith("axtask-worktrees-")) {
        for (const grandchild of shallowDirectories(child)) addUnique(candidates, candidateSeen, grandchild);
      }
    }
  }

  const found = [];
  const foundSeen = new Set();
  for (const candidate of candidates) {
    const result = probe(candidate);
    if (result && !foundSeen.has(key(result.root))) {
      foundSeen.add(key(result.root));
      found.push(result);
    }
  }

  if (found.length === 0) {
    return {
      ok: false,
      repository: EXPECTED_REPOSITORY,
      error: "No canonical AxTask Git checkout was found. A directory named AxTask is not sufficient evidence of a checkout.",
      searched: [...new Set([...direct, ...searchRoots].map((item) => path.resolve(item)))],
      nextAction: "Inspect the occupied AxTask directory before cloning. If it contains no unique files, clone origin into a deliberate durable path; do not run git init and do not delete the directory just to make this check pass.",
    };
  }

  const worktrees = [];
  const worktreeSeen = new Set();
  for (const repo of found) {
    const list = git(["-C", repo.root, "worktree", "list", "--porcelain"], repo.root);
    if (list.status !== 0) continue;
    for (const item of parseWorktrees(list.stdout)) {
      const id = key(item.path);
      if (worktreeSeen.has(id)) continue;
      worktreeSeen.add(id);
      worktrees.push({ ...item, sourceRoot: repo.root });
    }
  }

  const usableWorktrees = worktrees.filter((item) => !item.prunable && fs.existsSync(item.path) && probe(item.path));
  const primary = usableWorktrees[0]?.path ?? found[0].root;
  const main = usableWorktrees.find((item) => item.branch === "main")?.path ?? null;
  const currentProbe = probe(process.cwd());

  return {
    ok: true,
    repository: EXPECTED_REPOSITORY,
    primary,
    main,
    current: currentProbe?.root ?? null,
    worktrees,
    usableWorktrees,
    discoveredRoots: found.map((item) => item.root),
    origin: found[0].origin,
    head: found[0].head,
    branch: found[0].branch ?? "(detached)",
    note: main
      ? "A usable main worktree is registered. Use it only when the task truly requires branch main; fetch and inspection can run from any canonical checkout."
      : "No usable main worktree is checked out. That is not a fetch blocker; use a canonical checkout and origin/main, or create managed isolation through workspaces.mjs when mutation is required.",
  };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[axtask-checkout] ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    console.log("Usage: node scripts/ai-harness/resolve-checkout.mjs [--start PATH] [--search-root PATH] [--json|--print-path]");
    return;
  }

  const result = resolveAxTaskCheckout({ starts: args.starts, searchRoots: args.searchRoots });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else if (args.printPath && result.ok) console.log(result.primary);
  else if (result.ok) {
    console.log(`[axtask-checkout] PASS repository=${result.repository}`);
    console.log(`primary=${result.primary}`);
    console.log(`main=${result.main ?? "(not checked out)"}`);
    console.log(`current=${result.current ?? "(current directory is not an AxTask checkout)"}`);
    console.log(`head=${result.head ?? "unknown"}`);
    console.log(`branch=${result.branch}`);
    console.log(result.note);
  } else {
    console.error(`[axtask-checkout] FAIL ${result.error}`);
    console.error(result.nextAction);
  }
  if (!result.ok) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
