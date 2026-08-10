#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspectWorkspaceCleanliness, resolveRepoRoot } from "./workspaces.mjs";

const GIT_TIMEOUT_MS = 120_000;

function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    killSignal: "SIGKILL",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error?.code === "ETIMEDOUT") throw new Error(`git ${args.join(" ")} timed out after ${GIT_TIMEOUT_MS}ms`);
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function enabled(args, flag) {
  return args.includes(flag) || args.includes(`${flag}=true`);
}

export function summarizeWorkingDiff(cleanliness) {
  return {
    staged: cleanliness.staged,
    untracked: cleanliness.untracked,
    semanticTracked: cleanliness.semanticTracked,
    lineEndingOnly: cleanliness.lineEndingOnly,
    semanticallyClean: cleanliness.semanticallyClean,
  };
}

export function validateWorkingDiff(rootDir = process.cwd(), { stagedOnly = false, json = false } = {}) {
  const repoRoot = resolveRepoRoot(rootDir);
  const errors = [];

  const staged = runGit(["diff", "--cached", "--check"], repoRoot);
  if (staged.status !== 0) errors.push((staged.stdout || staged.stderr || "staged diff contains whitespace errors").trim());

  let summary = { staged: [], untracked: [], semanticTracked: [], lineEndingOnly: [], semanticallyClean: true };
  if (!stagedOnly) {
    const cleanliness = inspectWorkspaceCleanliness(repoRoot, repoRoot);
    summary = summarizeWorkingDiff(cleanliness);
    const working = runGit(["diff", "--check", "--ignore-cr-at-eol"], repoRoot);
    if (working.status !== 0) errors.push((working.stdout || working.stderr || "working diff contains whitespace errors").trim());
  }

  const result = {
    repoRoot,
    mode: stagedOnly ? "staged" : "working-tree",
    errors: errors.filter(Boolean),
    ...summary,
  };

  if (json) console.log(JSON.stringify(result, null, 2));
  else if (result.errors.length) {
    console.error(`[working-diff-hygiene] FAIL mode=${result.mode}`);
    for (const error of result.errors) console.error(error);
  } else {
    console.log(`[working-diff-hygiene] PASS mode=${result.mode} line-ending-only=${result.lineEndingOnly.length} semantic-tracked=${result.semanticTracked.length}`);
    for (const file of result.lineEndingOnly) console.warn(`[working-diff-hygiene] ignored proven CRLF/LF-only checkout noise: ${file}`);
  }

  return result;
}

function main() {
  const args = process.argv.slice(2);
  const stagedOnly = enabled(args, "--staged");
  const json = enabled(args, "--json");
  const rootArg = args.find((arg) => !arg.startsWith("--"));
  const result = validateWorkingDiff(rootArg ? path.resolve(rootArg) : process.cwd(), { stagedOnly, json });
  if (result.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
