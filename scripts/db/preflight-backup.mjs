#!/usr/bin/env node
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { latestDbManifest } from "./pg-tools.mjs";

function isProdLike(url) {
  const hard = process.env.NODE_ENV === "production" || process.env.RENDER === "true" || process.env.AXTASK_PRODUCTION === "true";
  if (!url) return hard;
  const host = new URL(url).hostname;
  const remote = host !== "localhost" && host !== "127.0.0.1";
  return hard || remote;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[db:backup:preflight] DATABASE_URL is required");
  process.exit(1);
}

const prodLike = isProdLike(url);
if (prodLike && !process.env.BACKUP_STORAGE_TARGET) {
  console.error("[db:backup:preflight] production-like env requires BACKUP_STORAGE_TARGET");
  process.exit(1);
}

const noLedger = process.argv.includes("--no-ledger");
const backupArgs = ["scripts/db/backup.mjs", ...(noLedger ? ["--no-ledger"] : [])];
const run = spawnSync(process.execPath, backupArgs, { stdio: "inherit", env: process.env });
if (run.status !== 0) process.exit(run.status ?? 1);

const manifestPath = latestDbManifest();
if (!manifestPath || !existsSync(manifestPath)) {
  console.error("[db:backup:preflight] manifest missing");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!existsSync(manifest.dumpFile)) {
  console.error("[db:backup:preflight] dump missing");
  process.exit(1);
}
const hash = createHash("sha256").update(readFileSync(manifest.dumpFile)).digest("hex");
if (hash !== manifest.sha256) {
  console.error("[db:backup:preflight] sha256 mismatch");
  process.exit(1);
}
if (noLedger && manifest.sourceLedgerMode !== "skipped") {
  console.error("[db:backup:preflight] --no-ledger requested but manifest does not prove source ledger skip");
  process.exit(1);
}
console.log("[db:backup:preflight] passed");
