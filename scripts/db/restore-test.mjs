#!/usr/bin/env node
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { databaseTargetFingerprint, resolveRestoreManifest, runPgTool } from "./pg-tools.mjs";

function isLoopbackDatabase(url) {
  const host = new URL(url).hostname.toLowerCase();
  return ["localhost", "127.0.0.1", "::1"].includes(host);
}

const explicitManifest = process.argv.find((a) => a.startsWith("--file="))?.slice(7) || null;
const recoveryRequested = process.argv.includes("--recovery");
let manifestPath;
try {
  manifestPath = resolveRestoreManifest({ explicitPath: explicitManifest, recoveryMode: recoveryRequested });
} catch (err) {
  console.error(`[db:restore:test] ${err.message}`);
  process.exit(1);
}
if (!manifestPath || !existsSync(manifestPath)) {
  console.error("[db:restore:test] no manifest found");
  process.exit(1);
}

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  console.error("[db:restore:test] DATABASE_URL is required so source/restore separation can be proven");
  process.exit(1);
}
const restoreUrl = process.env.RESTORE_DATABASE_URL;
if (!restoreUrl) {
  console.error("[db:restore:test] RESTORE_DATABASE_URL is required");
  process.exit(1);
}

let sourceFingerprint;
let restoreFingerprint;
try {
  sourceFingerprint = databaseTargetFingerprint(sourceUrl);
  restoreFingerprint = databaseTargetFingerprint(restoreUrl);
} catch {
  console.error("[db:restore:test] database URL is invalid");
  process.exit(1);
}
if (sourceFingerprint === restoreFingerprint) {
  console.error("[db:restore:test] restore target must be a different database from DATABASE_URL");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const recoveryManifest = manifest.recoveryMode === true || manifest.sourceLedgerMode === "skipped";
const enforceRecovery = recoveryRequested || recoveryManifest;
if (enforceRecovery && !explicitManifest) {
  console.error("[db:restore:test] recovery restore requires --file=<exact manifest path>");
  process.exit(1);
}
if (recoveryRequested && manifest.recoveryMode !== true) {
  console.error("[db:restore:test] --recovery requires a manifest created in recovery mode");
  process.exit(1);
}
if (enforceRecovery && !isLoopbackDatabase(restoreUrl)) {
  console.error("[db:restore:test] recovery restore target must be loopback/disposable");
  process.exit(1);
}
if (!manifest.dumpFile || !existsSync(manifest.dumpFile)) {
  console.error("[db:restore:test] dump file missing");
  process.exit(1);
}
if (!manifest.databaseFingerprint || manifest.databaseFingerprint !== sourceFingerprint) {
  console.error("[db:restore:test] manifest database fingerprint does not match DATABASE_URL");
  process.exit(1);
}
const hash = createHash("sha256").update(readFileSync(manifest.dumpFile)).digest("hex");
if (!manifest.sha256 || hash !== manifest.sha256) {
  console.error("[db:restore:test] dump sha256 mismatch");
  process.exit(1);
}
if (enforceRecovery && manifest.sourceLedgerMode !== "skipped") {
  console.error("[db:restore:test] recovery manifest must prove sourceLedgerMode=skipped");
  process.exit(1);
}

const restore = runPgTool("pg_restore", ["--clean", "--if-exists", "-d", restoreUrl, manifest.dumpFile]);
if (restore.status !== 0) process.exit(restore.status ?? 1);
const verify = spawnSync(process.execPath, ["scripts/migration/verify-schema.mjs"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: restoreUrl },
});
if (verify.status !== 0) process.exit(verify.status ?? 1);
manifest.restoreTestedAt = new Date().toISOString();
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[db:restore:test] restore-tested ${manifestPath}`);
