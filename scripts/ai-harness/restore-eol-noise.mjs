#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function run(args) {
  return spawnSync("git", args, { stdio: "inherit", shell: false });
}

function quiet(args) {
  return spawnSync("git", args, { stdio: "ignore", shell: false });
}

const paths = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (paths.length === 0) {
  console.error("usage: restore-eol-noise.mjs <tracked-path> [<tracked-path> ...]");
  process.exitCode = 2;
} else {
  for (const file of paths) {
    const tracked = quiet(["ls-files", "--error-unmatch", "--", file]);
    if (tracked.status !== 0) {
      console.error(`[eol-noise] REFUSE ${file}: path is not tracked`);
      process.exitCode = 1;
      break;
    }

    const semantic = quiet(["diff", "--quiet", "--ignore-space-at-eol", "--", file]);
    if (semantic.status === 1) {
      console.error(`[eol-noise] REFUSE ${file}: semantic content changes remain; this is not line-ending-only noise`);
      process.exitCode = 1;
      break;
    }
    if (semantic.status !== 0) {
      console.error(`[eol-noise] REFUSE ${file}: git diff failed with status ${semantic.status}`);
      process.exitCode = semantic.status ?? 1;
      break;
    }

    const restore = run(["restore", "--worktree", "--", file]);
    if (restore.status !== 0) {
      process.exitCode = restore.status ?? 1;
      break;
    }
    console.log(`[eol-noise] restored line-ending/at-EOL-only worktree noise: ${file}`);
  }
}
