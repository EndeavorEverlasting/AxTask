#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import pgModule from "pg";

const pg = pgModule.default || pgModule;

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

function maskDb(url) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const name = parsed.pathname.replace(/^\//, "");
  return {
    databaseHost: host ? `${host.slice(0, 2)}***${host.slice(-2)}` : "unknown",
    databaseName: name ? `${name.slice(0, 1)}***${name.slice(-1)}` : "unknown",
  };
}

function nowParts() {
  const now = new Date();
  return { day: now.toISOString().slice(0, 10), stamp: now.toISOString().replace(/[:.]/g, "-") };
}

async function writeLedger(manifest) {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    const t = await client.query("SELECT to_regclass('public.backup_records') AS table_ref");
    if (!t.rows[0]?.table_ref) return;
    await client.query(
      `INSERT INTO backup_records (status, path_or_url, metadata_json, completed_at, created_at)
       VALUES ('completed', $1, $2::jsonb, now(), now())`,
      [manifest.dumpFile, JSON.stringify(manifest)],
    );
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const databaseUrl = requireDatabaseUrl();
  const { day, stamp } = nowParts();
  const base = path.resolve(process.cwd(), ".backups", "db", day);
  mkdirSync(base, { recursive: true });
  const fileBase = `axtask-db-${stamp}`;
  const dumpFile = path.join(base, `${fileBase}.dump`);
  const manifestFile = path.join(base, `${fileBase}.manifest.json`);

  const dump = spawnSync("pg_dump", [databaseUrl, "-Fc", "-f", dumpFile], { stdio: "inherit" });
  if (dump.status !== 0 || !existsSync(dumpFile)) throw new Error("pg_dump failed or dump file missing");

  const bytes = readFileSync(dumpFile);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (!sha256) throw new Error("sha256 failed");

  const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" });
  const gitCommit = (git.stdout || "unknown").trim() || "unknown";
  const masked = maskDb(databaseUrl);
  const manifest = {
    app: "AxTask",
    backupKind: "db_dump",
    createdAt: new Date().toISOString(),
    ...masked,
    gitCommit,
    dumpFile,
    sha256,
    byteSize: statSync(dumpFile).size,
    retentionClass: "daily",
    restoreTestedAt: null,
  };
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (!existsSync(manifestFile)) throw new Error("manifest missing");

  await writeLedger(manifest);
  console.log(`[db:backup] wrote ${dumpFile}`);
  console.log(`[db:backup] manifest ${manifestFile}`);
}

main().catch((err) => {
  console.error(`[db:backup] FAILED: ${err.message}`);
  process.exit(1);
});
