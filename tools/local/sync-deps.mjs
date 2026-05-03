#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function run(command, args) {
  console.log(`[deps-sync] Running: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const root = resolve(process.cwd());
const hasLockfile = existsSync(resolve(root, "package-lock.json"));

if (hasLockfile) {
  run("npm", ["ci"]);
} else {
  run("npm", ["install"]);
}
console.log("[deps-sync] Dependency sync complete.");
