#!/usr/bin/env node
/**
 * Ensures the Python billing bridge venv exists and deps are installed.
 * Called automatically from npm postinstall.
 * Idempotent — skips if .venv/pyvenv.cfg already exists and requirements
 * haven't changed since last install.
 */
import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";

const BRIDGE_ROOT = resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const VENV_DIR = join(BRIDGE_ROOT, ".venv");
const REQ_FILE = join(BRIDGE_ROOT, "requirements.txt");
const STAMP_FILE = join(VENV_DIR, ".requirements-hash");

// Determine python binary (prefer python3 on unix, python on windows)
function findPython() {
  for (const bin of ["python3", "python"]) {
    try {
      const r = spawnSync(bin, ["--version"], { encoding: "utf-8", timeout: 5000 });
      if (r.status === 0 && /Python 3\./i.test(r.stdout + r.stderr)) return bin;
    } catch {}
  }
  return null;
}

const pythonBin = process.env.BILLING_BRIDGE_PYTHON || findPython();
if (!pythonBin) {
  console.log("[billing-bridge] Python 3 not found — skipping venv setup (billing bridge will not be available)");
  process.exit(0);
}

// Skip entirely if requirements.txt is missing (e.g. Docker layer without source yet)
if (!existsSync(REQ_FILE)) {
  console.log("[billing-bridge] requirements.txt not found — skipping venv setup");
  process.exit(0);
}

// Hash requirements to detect changes
const reqHash = createHash("sha256").update(readFileSync(REQ_FILE)).digest("hex").slice(0, 16);

const alreadyInstalled =
  existsSync(join(VENV_DIR, "pyvenv.cfg")) &&
  existsSync(STAMP_FILE) &&
  readFileSync(STAMP_FILE, "utf-8").trim() === reqHash;

if (alreadyInstalled) {
  console.log("[billing-bridge] Python venv up to date — skipping");
  process.exit(0);
}

console.log("[billing-bridge] Setting up Python venv...");

// Create venv if needed
if (!existsSync(join(VENV_DIR, "pyvenv.cfg"))) {
  console.log(`[billing-bridge] Creating venv at ${VENV_DIR}`);
  execSync(`${pythonBin} -m venv "${VENV_DIR}"`, { stdio: "inherit", cwd: BRIDGE_ROOT });
}

// Determine pip path inside venv
const isWindows = process.platform === "win32";
const pip = join(VENV_DIR, isWindows ? "Scripts" : "bin", "pip");

console.log("[billing-bridge] Installing Python dependencies...");
execSync(`"${pip}" install -r "${REQ_FILE}" --quiet`, { stdio: "inherit", cwd: BRIDGE_ROOT });

// Write stamp
writeFileSync(STAMP_FILE, reqHash, "utf-8");
console.log("[billing-bridge] Python venv ready");

