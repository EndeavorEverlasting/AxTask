#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { latestDbManifest, runPgTool } from "./pg-tools.mjs";

const argFile = process.argv.find((a) => a.startsWith("--file="))?.slice(7);
const manifestPath = argFile || latestDbManifest();
if (!manifestPath || !existsSync(manifestPath)) {
  console.error("[db:restore:test] no manifest found");
  process.exit(1);
}
const restoreUrl = process.env.RESTORE_DATABASE_URL;
if (!restoreUrl) {
  console.error("[db:restore:test] RESTORE_DATABASE_URL is required");
  process.exit(1);
}
if (restoreUrl === process.env.DATABASE_URL) {
  console.error("[db:restore:test] restore target must not equal DATABASE_URL");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!manifest.dumpFile || !existsSync(manifest.dumpFile)) {
  console.error("[db:restore:test] dump file missing");
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
