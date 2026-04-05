#!/usr/bin/env node
/**
 * Local Docker cleanup helper with safe defaults.
 *
 * - Default: non-destructive cleanup (preserves volumes/data)
 * - Optional: destructive reset with --wipe-data --yes
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import {
  composeDownArgs,
  parseDockerCleanupArgv,
} from "./docker-cleanup-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const isWin = process.platform === "win32";
const { wipeData, yes, noPrune } = parseDockerCleanupArgv(process.argv.slice(2));

function run(label, command, args, options = {}) {
  console.log(`\n[docker:cleanup] ${label}`);
  const r = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: isWin,
    ...options,
  });
  return r.status ?? 1;
}

function dockerAvailable() {
  const r = spawnSync("docker", ["version"], {
    cwd: projectRoot,
    stdio: "pipe",
    shell: isWin,
  });
  return r.status === 0;
}

if (!dockerAvailable()) {
  console.error(
    "[docker:cleanup] Docker is not installed or not on PATH. Install/start Docker and retry.",
  );
  process.exit(1);
}

if (wipeData && !yes) {
  console.error(
    "[docker:cleanup] Refusing destructive reset without --yes. Use: npm run docker:reset",
  );
  process.exit(1);
}

if (wipeData) {
  console.warn(
    "[docker:cleanup] Destructive mode enabled: Docker volumes for this compose project will be deleted.",
  );
} else {
  console.log(
    "[docker:cleanup] Safe mode: preserving Docker volumes and local data.",
  );
}

const downExit = run(
  wipeData
    ? "Stopping stack + removing containers/networks/orphans/volumes"
    : "Stopping stack + removing containers/networks/orphans (preserve volumes)",
  "docker",
  composeDownArgs({ wipeData }),
);

if (downExit !== 0) {
  process.exit(downExit);
}

if (!noPrune) {
  // Non-destructive cache hygiene: only dangling image layers, no containers/volumes.
  const pruneExit = run(
    "Pruning dangling images (safe cache cleanup)",
    "docker",
    ["image", "prune", "-f"],
  );
  if (pruneExit !== 0) {
    process.exit(pruneExit);
  }
}

console.log("\n[docker:cleanup] Complete.");
if (wipeData) {
  console.log(
    "[docker:cleanup] Data was wiped. Next: npm run docker:setup (or npm run docker:up).",
  );
} else {
  console.log("[docker:cleanup] Data preserved. Next: npm run docker:up");
}

