#!/usr/bin/env node
/**
 * Initialize git submodules from the AxTask repo root (e.g. NodeWeaver at services/nodeweaver/upstream).
 * Safe no-op when there are no submodules.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

if (!fs.existsSync(path.join(projectRoot, "package.json"))) {
  console.error("[submodule:init] Run this from the AxTask repo (package.json missing).");
  process.exit(1);
}

const r = spawnSync(
  "git",
  ["submodule", "update", "--init", "--recursive"],
  { cwd: projectRoot, stdio: "inherit", shell: process.platform === "win32" },
);

process.exit(r.status ?? 1);
