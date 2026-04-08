#!/usr/bin/env node
/**
 * Lightweight runtime checks: Node version, common tooling, and env hints.
 * Does not fail on optional gaps — prints remediation text instead.
 */
import { spawnSync } from "node:child_process";

const MIN_NODE_MAJOR = 18;
const major = Number.parseInt(process.versions.node.split(".")[0], 10);

let failed = false;

if (Number.isNaN(major) || major < MIN_NODE_MAJOR) {
  console.error(
    `[deps] Node.js ${MIN_NODE_MAJOR}+ required (found ${process.version}). Install a current LTS release.`,
  );
  failed = true;
} else {
  console.log(`[deps] Node ${process.version} OK`);
}

function hasCmd(cmd, args = ["--version"]) {
  const r = spawnSync(cmd, args, { shell: process.platform === "win32" });
  return r.status === 0;
}

if (!hasCmd("npm")) {
  console.warn("[deps] npm not found on PATH — install Node.js (includes npm) to run scripts.");
} else {
  console.log("[deps] npm OK");
}

if (!process.env.DATABASE_URL) {
  console.warn(
    "[deps] DATABASE_URL is unset — required for `npm run dev`, migrations, and DB-backed tests. Copy `.env.example` to `.env` and set DATABASE_URL.",
  );
} else {
  console.log("[deps] DATABASE_URL is set");
}

if (!hasCmd("docker", ["--version"])) {
  console.warn("[deps] Docker CLI not found — optional unless you use `npm run docker:up` / compose workflows.");
} else {
  console.log("[deps] docker CLI OK");
}

process.exit(failed ? 1 : 0);
