#!/usr/bin/env node
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  statSync,
  statfsSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pgModule from "pg";
import {
  backupDbRoot,
  databaseTargetFingerprint,
  isLoopbackDatabaseUrl,
  latestDbManifest,
  resolveBackupStorageRoot,
  runPgTool,
} from "./pg-tools.mjs";

const pg = pgModule.default || pgModule;
const GIB = 1024 ** 3;

export function isProdLike(url, env = process.env) {
  const hard = env.NODE_ENV === "production" || env.RENDER === "true" || env.AXTASK_PRODUCTION === "true";
  if (!url) return hard;
  return hard || !isLoopbackDatabaseUrl(url);
}

export function assertDistinctDatabaseTargets(sourceUrl, restoreUrl) {
  if (!restoreUrl) throw new Error("RESTORE_DATABASE_URL is required before starting the recovery backup");
  if (databaseTargetFingerprint(sourceUrl) === databaseTargetFingerprint(restoreUrl)) {
    throw new Error("restore target must be a different database from DATABASE_URL");
  }
}

export function assertDisposableRestoreTarget(restoreUrl) {
  databaseTargetFingerprint(restoreUrl);
  if (!isLoopbackDatabaseUrl(restoreUrl)) {
    throw new Error("RESTORE_DATABASE_URL must be loopback/disposable for the recovery preflight");
  }
}

export function validateBackupStorageConfig({
  env = process.env,
  cwd = process.cwd(),
  prodLike = false,
  recoveryMode = false,
} = {}) {
  const storageTarget = String(env.BACKUP_STORAGE_TARGET ?? "").trim().toLowerCase();
  if ((prodLike || recoveryMode) && !storageTarget) {
    throw new Error(`${recoveryMode ? "recovery" : "production-like"} env requires BACKUP_STORAGE_TARGET=local`);
  }
  if (storageTarget && storageTarget !== "local") {
    throw new Error(`unsupported BACKUP_STORAGE_TARGET '${storageTarget}'; raw DB backup currently supports local only`);
  }

  const configured = String(env.BACKUP_LOCAL_DIR ?? "").trim();
  if (recoveryMode && !configured) {
    throw new Error("recovery backup requires BACKUP_LOCAL_DIR pointing to protected storage");
  }
  if (recoveryMode && !path.isAbsolute(configured)) {
    throw new Error("recovery BACKUP_LOCAL_DIR must be an absolute protected-storage path");
  }

  const storageRoot = resolveBackupStorageRoot({ cwd, env });
  if (recoveryMode) {
    const relative = path.relative(path.resolve(cwd), storageRoot);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      throw new Error("recovery BACKUP_LOCAL_DIR must be outside the repository checkout");
    }
  }
  return storageRoot;
}

export function requiredBackupCapacityBytes(sourceBytes) {
  const bytes = Number(sourceBytes);
  if (!Number.isFinite(bytes) || bytes <= 0) throw new Error("source database size must be a positive number");
  return Math.ceil(bytes + Math.max(GIB, bytes * 0.15));
}

export function assertStorageCapacity({ sourceBytes, freeBytes }) {
  const required = requiredBackupCapacityBytes(sourceBytes);
  const available = Number(freeBytes);
  if (!Number.isFinite(available) || available < required) {
    throw new Error(`protected storage capacity is insufficient; required at least ${required} bytes`);
  }
  return required;
}

function assertStorageWritable(storageRoot) {
  if (!existsSync(storageRoot) || !statSync(storageRoot).isDirectory()) {
    throw new Error("BACKUP_LOCAL_DIR must already exist as a protected-storage directory");
  }
  const probe = path.join(storageRoot, `.axtask-backup-write-probe-${process.pid}-${Date.now()}`);
  let fd = null;
  try {
    fd = openSync(probe, "wx", 0o600);
    writeSync(fd, "axtask-backup-preflight\n");
    fsyncSync(fd);
  } catch {
    throw new Error("BACKUP_LOCAL_DIR is not writable");
  } finally {
    if (fd !== null) closeSync(fd);
    if (existsSync(probe)) unlinkSync(probe);
  }
}

function storageFreeBytes(storageRoot) {
  const stats = statfsSync(storageRoot, { bigint: true });
  return Number(stats.bavail * stats.bsize);
}

function probePgTool(tool) {
  const run = runPgTool(tool, ["--version"], { stdio: "pipe", encoding: "utf8" });
  if (run.error || run.status !== 0) throw new Error(`${tool} is required before starting the backup`);
}

async function queryDatabaseSize(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query("SELECT pg_database_size(current_database())::text AS bytes");
    const bytes = Number(result.rows[0]?.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0) throw new Error("invalid database size");
    return bytes;
  } catch {
    throw new Error("source database connectivity/size check failed");
  } finally {
    await pool.end().catch(() => {});
  }
}

async function verifyRestoreTargetConnectivity(restoreUrl) {
  const pool = new pg.Pool({ connectionString: restoreUrl, max: 1 });
  try {
    await pool.query("SELECT 1");
  } catch {
    throw new Error("disposable RESTORE_DATABASE_URL is not reachable");
  } finally {
    await pool.end().catch(() => {});
  }
}

function isPathWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function runPreflight({ env = process.env, argv = null, cwd = process.cwd() } = {}) {
  const args = argv === null ? process.argv.slice(2) : argv;
  const noLedger = argv === null ? process.argv.includes("--no-ledger") : args.includes("--no-ledger");
  const recoveryMode = noLedger;
  const validateOnly = args.includes("--validate-only");
  if (validateOnly && !recoveryMode) {
    throw new Error("--validate-only is reserved for --no-ledger recovery prerequisite validation");
  }

  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  try {
    new URL(url);
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }

  const prodLike = isProdLike(url, env);
  const storageRoot = validateBackupStorageConfig({ env, cwd, prodLike, recoveryMode });
  let restoreUrl = null;

  probePgTool("pg_dump");

  let sourceBytes = null;
  let freeBytes = null;
  if (recoveryMode) {
    restoreUrl = env.RESTORE_DATABASE_URL;
    if (!restoreUrl) throw new Error("RESTORE_DATABASE_URL is required before starting the recovery backup");
    try {
      new URL(restoreUrl);
    } catch {
      throw new Error("RESTORE_DATABASE_URL is invalid");
    }

    assertDistinctDatabaseTargets(url, restoreUrl);
    assertDisposableRestoreTarget(restoreUrl);
    probePgTool("pg_restore");
    assertStorageWritable(storageRoot);
    sourceBytes = await queryDatabaseSize(url);
    await verifyRestoreTargetConnectivity(restoreUrl);
    freeBytes = storageFreeBytes(storageRoot);
    assertStorageCapacity({ sourceBytes, freeBytes });
  }

  if (validateOnly) {
    console.log("[db:backup:preflight] recovery prerequisites passed");
    return { manifestPath: null, sourceBytes, freeBytes, recoveryMode };
  }

  const manifestResultPath = recoveryMode
    ? path.join(os.tmpdir(), `axtask-backup-manifest-${process.pid}-${randomUUID()}.txt`)
    : null;
  const backupArgs = [
    "scripts/db/backup.mjs",
    ...(noLedger ? ["--no-ledger"] : []),
    ...(manifestResultPath ? [`--manifest-result=${manifestResultPath}`] : []),
  ];
  const run = spawnSync(process.execPath, backupArgs, { cwd, stdio: "inherit", env });
  if (run.status !== 0) {
    if (manifestResultPath && existsSync(manifestResultPath)) unlinkSync(manifestResultPath);
    throw new Error(`backup command failed with exit code ${run.status ?? 1}`);
  }

  let manifestPath = null;
  if (recoveryMode) {
    try {
      if (!manifestResultPath || !existsSync(manifestResultPath)) throw new Error("exact backup manifest result missing");
      manifestPath = readFileSync(manifestResultPath, "utf8").trim();
    } finally {
      if (manifestResultPath && existsSync(manifestResultPath)) unlinkSync(manifestResultPath);
    }
  } else {
    manifestPath = latestDbManifest(backupDbRoot({ cwd, env }));
  }

  if (!manifestPath || !existsSync(manifestPath)) throw new Error("manifest missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!manifest.dumpFile || !existsSync(manifest.dumpFile)) throw new Error("dump missing");
  if (!manifest.databaseFingerprint || manifest.databaseFingerprint !== databaseTargetFingerprint(url)) {
    throw new Error("manifest database fingerprint does not match DATABASE_URL");
  }
  if (recoveryMode) {
    if (manifest.recoveryMode !== true) throw new Error("manifest does not prove recovery mode");
    if (manifest.storageTarget !== "local") throw new Error("manifest does not prove local protected-storage target");
    if (!isPathWithin(storageRoot, path.resolve(manifest.dumpFile))) {
      throw new Error("manifest dump path is outside BACKUP_LOCAL_DIR");
    }
  }

  const hash = createHash("sha256").update(readFileSync(manifest.dumpFile)).digest("hex");
  if (hash !== manifest.sha256) throw new Error("sha256 mismatch");
  if (recoveryMode && manifest.sourceLedgerMode !== "skipped") {
    throw new Error("--no-ledger requested but manifest does not prove source ledger skip");
  }
  if (recoveryMode) console.log(`AXTASK_BACKUP_MANIFEST=${manifestPath}`);
  console.log("[db:backup:preflight] passed");
  return { manifestPath, sourceBytes, freeBytes, recoveryMode };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirect) {
  runPreflight().catch((err) => {
    console.error(`[db:backup:preflight] ${err.message}`);
    process.exitCode = 1;
  });
}
