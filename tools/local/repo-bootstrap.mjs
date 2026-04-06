#!/usr/bin/env node
/**
 * Runs on postinstall, predev (before npm run dev), and npm run submodule:init.
 * - Verifies vendored NodeWeaver at services/nodeweaver/upstream.
 * - Outside CI: if `uv` is on PATH and uv.lock exists, runs `uv sync` when lock/pyproject changed (fingerprint in .local/).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const isWin = process.platform === "win32";
const nwUpstream = path.join(projectRoot, "services", "nodeweaver", "upstream");
const nwDockerfile = path.join(nwUpstream, "Dockerfile");
const nwUvLock = path.join(nwUpstream, "uv.lock");
const nwPyProject = path.join(nwUpstream, "pyproject.toml");
const uvFingerprintPath = path.join(projectRoot, ".local", "nodeweaver-uv-fingerprint");

function truthyEnv(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function inCi() {
  return truthyEnv(process.env.CI) || truthyEnv(process.env.GITHUB_ACTIONS) || truthyEnv(process.env.AXTASK_CI);
}

function verifyNodeweaver() {
  if (!fs.existsSync(path.join(projectRoot, "package.json"))) {
    console.error("[axtask:bootstrap] Run from AxTask repo root (package.json missing).");
    process.exit(1);
  }
  if (!fs.existsSync(nwDockerfile)) {
    console.error(
      "[axtask:bootstrap] Missing services/nodeweaver/upstream/Dockerfile. Restore NodeWeaver sources from git or copy the app into that folder (exclude .git).",
    );
    process.exit(1);
  }
}

function hasUv() {
  const cmd = isWin ? "where" : "which";
  const r = spawnSync(cmd, ["uv"], { shell: isWin, encoding: "utf8" });
  return (r.status ?? 1) === 0;
}

function uvInputsFingerprint() {
  let buf = Buffer.alloc(0);
  if (fs.existsSync(nwUvLock)) buf = Buffer.concat([buf, fs.readFileSync(nwUvLock)]);
  if (fs.existsSync(nwPyProject)) buf = Buffer.concat([buf, fs.readFileSync(nwPyProject)]);
  return createHash("sha256").update(buf).digest("hex");
}

function uvSyncNeeded() {
  if (!fs.existsSync(nwUvLock) && !fs.existsSync(nwPyProject)) return false;
  if (!fs.existsSync(nwUvLock)) return true;
  try {
    const prev = fs.existsSync(uvFingerprintPath) ? fs.readFileSync(uvFingerprintPath, "utf8").trim() : "";
    return prev !== uvInputsFingerprint();
  } catch {
    return true;
  }
}

function writeUvFingerprint() {
  fs.mkdirSync(path.dirname(uvFingerprintPath), { recursive: true });
  fs.writeFileSync(uvFingerprintPath, `${uvInputsFingerprint()}\n`, "utf8");
}

function maybeUvSync() {
  if (inCi()) return;
  if (truthyEnv(process.env.AXTASK_SKIP_NODEWEAVER_PY)) {
    console.log("[axtask:bootstrap] AXTASK_SKIP_NODEWEAVER_PY set — skipping NodeWeaver uv sync.");
    return;
  }
  if (!uvSyncNeeded()) {
    console.log("[axtask:bootstrap] NodeWeaver Python env up to date (uv lock unchanged).");
    return;
  }
  if (!hasUv()) {
    console.log(
      "[axtask:bootstrap] `uv` not on PATH — skipping NodeWeaver Python sync (optional for AxTask; use Docker profile nodeweaver for the classifier).",
    );
    return;
  }

  console.log("[axtask:bootstrap] Syncing NodeWeaver Python dependencies (uv)…");
  let r = spawnSync("uv", ["sync", "--frozen"], {
    cwd: nwUpstream,
    stdio: "inherit",
    shell: isWin,
  });
  if ((r.status ?? 1) !== 0) {
    console.warn("[axtask:bootstrap] uv sync --frozen failed, retrying with uv sync…");
    r = spawnSync("uv", ["sync"], {
      cwd: nwUpstream,
      stdio: "inherit",
      shell: isWin,
    });
  }
  if ((r.status ?? 1) !== 0) {
    console.warn(
      "[axtask:bootstrap] uv sync failed — continuing. AxTask still runs without local Python. Fix uv or set AXTASK_SKIP_NODEWEAVER_PY=1. See services/nodeweaver/README.md.",
    );
    return;
  }
  writeUvFingerprint();
}

verifyNodeweaver();
maybeUvSync();
console.log("[axtask:bootstrap] OK.");
