#!/usr/bin/env node
/**
 * Free a TCP listen port (default: PORT env or 5000).
 *
 * Windows: parses `netstat -ano` LISTENING rows (same flow as manual netstat + taskkill).
 * macOS/Linux: `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` when available.
 *
 * Usage:
 *   node tools/local/kill-port-listeners.mjs              # dry-run, default port
 *   node tools/local/kill-port-listeners.mjs 3000       # dry-run, port 3000
 *   node tools/local/kill-port-listeners.mjs --force    # kill default port listeners
 *   node tools/local/kill-port-listeners.mjs 3000 -f    # kill port 3000
 *
 * npm:
 *   npm run port:free
 *   npm run port:free -- 3000
 *   npm run port:free:dry
 */
import { spawnSync } from "node:child_process";

const ownPid = process.pid;

function parseArgs(argv) {
  let port = parseInt(process.env.PORT || "5000", 10);
  let force = false;
  let dryRun = true;

  for (const a of argv) {
    if (a === "--force" || a === "-f") {
      force = true;
      dryRun = false;
    } else if (a === "--dry-run") {
      dryRun = true;
      force = false;
    } else if (/^\d+$/.test(a)) {
      port = parseInt(a, 10);
    }
  }

  if (force) dryRun = false;
  return { port, dryRun };
}

/** @returns {number[]} */
function pidsWindowsListen(port) {
  const r = spawnSync("netstat", ["-ano"], { encoding: "utf8", shell: true });
  if (r.error || r.status !== 0) {
    console.error("[port:free] netstat -ano failed:", r.error || `exit ${r.status}`);
    process.exit(1);
  }
  const portNeedle = `:${port}`;
  const pids = new Set();
  for (const line of (r.stdout || "").split(/\r?\n/)) {
    if (!line.includes(portNeedle)) continue;
    if (!/\sLISTENING\s+/.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parseInt(parts[parts.length - 1], 10);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (pid === ownPid) continue;
    if (pid === 0 || pid === 4) continue;
    pids.add(pid);
  }
  return [...pids].sort((a, b) => a - b);
}

/** @returns {number[]} */
function pidsUnixListen(port) {
  const r = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  });
  if (r.error && r.error.code === "ENOENT") {
    console.error(
      "[port:free] `lsof` not found. Install it or on Windows run from cmd/PowerShell on this repo.",
    );
    process.exit(1);
  }
  if (r.status !== 0 && !(r.stdout || "").trim()) {
    return [];
  }
  const pids = new Set();
  for (const line of (r.stdout || "").split(/\r?\n/)) {
    const pid = parseInt(line.trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (pid === ownPid) continue;
    pids.add(pid);
  }
  return [...pids].sort((a, b) => a - b);
}

function collectListenPids(port) {
  return process.platform === "win32" ? pidsWindowsListen(port) : pidsUnixListen(port);
}

function killWindows(pid) {
  const r = spawnSync("taskkill", ["/PID", String(pid), "/F"], {
    stdio: "inherit",
    shell: true,
  });
  return (r.status ?? 1) === 0;
}

function killUnix(pid) {
  const r = spawnSync("kill", ["-9", String(pid)], { stdio: "inherit" });
  return (r.status ?? 1) === 0;
}

function main() {
  const { port, dryRun } = parseArgs(process.argv.slice(2));

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error("[port:free] Invalid port.");
    process.exit(1);
  }

  console.log(`[port:free] Scanning TCP listeners on port ${port} (${process.platform})…`);
  const pids = collectListenPids(port);

  if (pids.length === 0) {
    console.log(`[port:free] No LISTENING processes found on port ${port}.`);
    process.exit(0);
  }

  console.log(`[port:free] PIDs: ${pids.join(", ")}`);

  if (dryRun) {
    console.log(
      `[port:free] Dry run only. To terminate them: npm run port:free -- ${port} --force`,
    );
    console.log(`[port:free] Or: node tools/local/kill-port-listeners.mjs ${port} --force`);
    process.exit(0);
  }

  let failed = 0;
  for (const pid of pids) {
    const ok = process.platform === "win32" ? killWindows(pid) : killUnix(pid);
    if (!ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`[port:free] ${failed} process(es) could not be terminated (permissions or already exited).`);
    process.exit(1);
  }

  console.log(`[port:free] Done. Port ${port} should be free for LISTENING sockets we matched.`);
}

main();
