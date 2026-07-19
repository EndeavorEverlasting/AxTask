#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    skipped: Boolean(result.error),
    error: result.error?.message ?? null,
  };
}

function sanitizeRemoteLine(line) {
  return line.replace(/(https?:\/\/)[^@\s]+@/g, "$1***@");
}

function parseArgs(argv) {
  const outputArg = argv.find((arg) => arg.startsWith("--output="));
  return { output: outputArg ? path.resolve(repoRoot, outputArg.slice(9)) : null };
}

const commands = {
  root: ["git", ["rev-parse", "--show-toplevel"]],
  status: ["git", ["status", "--short"]],
  branch: ["git", ["branch", "--show-current"]],
  head: ["git", ["rev-parse", "HEAD"]],
  recentCommits: ["git", ["log", "--oneline", "--decorate", "-12"]],
  worktrees: ["git", ["worktree", "list"]],
  remotes: ["git", ["remote", "-v"]],
  openPrs: ["gh", ["pr", "list", "--state", "open", "--limit", "30", "--json", "number,title,headRefName,baseRefName,isDraft,mergeStateStatus"]],
  prStatus: ["gh", ["pr", "status"]],
};

const snapshot = {
  schemaVersion: 1,
  authorityRef: "axtask.agent-authority.v1",
  generatedAt: new Date().toISOString(),
  repoRoot,
  readOnly: true,
  results: {},
};

for (const [id, [command, args]] of Object.entries(commands)) {
  const result = run(command, args);
  if (id === "remotes") result.stdout = result.stdout.split(/\r?\n/).map(sanitizeRemoteLine).join("\n");
  snapshot.results[id] = result;
}

const text = `${JSON.stringify(snapshot, null, 2)}\n`;
const { output } = parseArgs(process.argv.slice(2));
if (output) {
  if (!output.startsWith(path.join(repoRoot, ".ai", "runs") + path.sep)) {
    console.error("[ai-inspect] --output must be under .ai/runs/");
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, text, "utf8");
  console.log(`[ai-inspect] wrote ${path.relative(repoRoot, output)}`);
} else {
  process.stdout.write(text);
}
