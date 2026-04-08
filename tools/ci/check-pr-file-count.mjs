#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = { maxFiles: Number(process.env.PR_FILE_LIMIT || 300), baseRef: process.env.PR_FILE_BASE || "" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--max-files" && argv[i + 1]) {
      args.maxFiles = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--base" && argv[i + 1]) {
      args.baseRef = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if ((result.status ?? 1) !== 0) {
    const stderr = (result.stderr || "").trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
  return (result.stdout || "").trim();
}

function detectBaseRef(override) {
  if (override) return override;
  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const candidate of candidates) {
    const result = spawnSync("git", ["rev-parse", "--verify", candidate], { encoding: "utf8" });
    if ((result.status ?? 1) === 0) return candidate;
  }
  return "origin/main";
}

function groupByTopLevel(files) {
  const buckets = new Map();
  for (const file of files) {
    const top = file.includes("/") ? file.split("/")[0] : "(repo-root)";
    buckets.set(top, (buckets.get(top) || 0) + 1);
  }
  return [...buckets.entries()].sort((a, b) => b[1] - a[1]);
}

function changedFilesFromGit(baseRef) {
  const mergeBase = runGit(["merge-base", "HEAD", baseRef]);
  const raw = runGit(["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...HEAD`]);
  if (!raw) return [];
  return raw
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

function changedFilesFromEventPayload(eventPath) {
  if (!eventPath || !fs.existsSync(eventPath)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    if (!payload.pull_request || typeof payload.pull_request.changed_files !== "number") return null;
    return { count: payload.pull_request.changed_files };
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(args.maxFiles) || args.maxFiles <= 0) {
    console.error("[pr-file-count] --max-files must be a positive number.");
    process.exit(1);
  }

  const eventPayload = changedFilesFromEventPayload(process.env.GITHUB_EVENT_PATH);
  if (eventPayload) {
    const count = eventPayload.count;
    console.log(`[pr-file-count] Pull request changes ${count} file(s). Limit is ${args.maxFiles}.`);
    if (count > args.maxFiles) {
      console.error(
        `[pr-file-count] PR is over the file limit by ${count - args.maxFiles}. Split the branch into smaller PRs.`,
      );
      process.exit(1);
    }
    console.log("[pr-file-count] Within limit.");
    return;
  }

  const baseRef = detectBaseRef(args.baseRef);
  const files = changedFilesFromGit(baseRef);
  const count = files.length;
  const top = groupByTopLevel(files);

  console.log(`[pr-file-count] Base: ${baseRef}`);
  console.log(`[pr-file-count] Changed files: ${count}`);
  if (top.length > 0) {
    console.log("[pr-file-count] Top-level distribution:");
    for (const [name, size] of top.slice(0, 10)) {
      console.log(`  - ${name}: ${size}`);
    }
  }

  if (count > args.maxFiles) {
    console.error(`[pr-file-count] Over limit by ${count - args.maxFiles} file(s).`);
    process.exit(1);
  }
  console.log("[pr-file-count] Within limit.");
}

main();
