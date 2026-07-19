#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const force = process.argv.includes("--force");

function git(args, allowFail = false) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (!allowFail && result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  }
  return (result.stdout || "").trim();
}

const current = git(["config", "--local", "--get", "core.hooksPath"], true);
if (current && current !== ".githooks" && !force) {
  console.error(`[ai-hooks] existing core.hooksPath=${current}; rerun with --force to replace it`);
  process.exit(1);
}
git(["config", "--local", "core.hooksPath", ".githooks"]);
console.log("[ai-hooks] configured local core.hooksPath=.githooks");
console.log("[ai-hooks] local configuration only; no global Git settings changed");
