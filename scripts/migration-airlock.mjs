#!/usr/bin/env node
/**
 * Migration Airlock — refuses to run schema migrations unless a verified
 * recent backup exists. This prevents running destructive DDL without a
 * safety net.
 *
 * Usage:
 *   node scripts/migration-airlock.mjs
 *   node scripts/migration-airlock.mjs --verify   # also re-reads and hashes the file
 *   node scripts/migration-airlock.mjs --skip     # bypass (use only in emergencies)
 *
 * Exit codes:
 *   0 — airlock passed (recent verified backup exists)
 *   1 — airlock failed (no recent backup or verification failed)
 *   2 — bypassed via --skip
 */

import pgModule from "pg";
const pg = pgModule.default || pgModule;
import { createHash, createDecipheriv, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { databaseTargetFingerprint, latestDbManifest } from "./db/pg-tools.mjs";

const gunzipAsync = promisify(gunzip);

const AES_256_GCM_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function normalizeKey(keyInput) {
  if (/^[0-9a-fA-F]{64}$/.test(keyInput)) return Buffer.from(keyInput, "hex");
  const b64 = Buffer.from(keyInput, "base64");
  if (b64.length === KEY_LENGTH) return b64;
  return scryptSync(keyInput, "axtask-backup-salt", KEY_LENGTH);
}

function decryptBackupPayload(payload, keyInput) {
  const key = normalizeKey(keyInput);
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Backup payload too short to contain iv + authTag");
  }
  const iv = buf.slice(0, IV_LENGTH);
  const authTag = buf.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.slice(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(AES_256_GCM_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function parseMetadata(record) {
  try {
    return JSON.parse(record?.metadata_json || "{}");
  } catch {
    return {};
  }
}

function targetMatches(meta, expectedFingerprint) {
  return typeof meta.databaseFingerprint === "string"
    && meta.databaseFingerprint === expectedFingerprint;
}

const SKIP = process.argv.includes("--skip") || process.argv.includes("--skip-airlock");
const DATABASE_URL = process.env.DATABASE_URL || "";
const host = DATABASE_URL ? new URL(DATABASE_URL).hostname : "";
const isProdLike = process.env.NODE_ENV === "production"
  || process.env.RENDER === "true"
  || process.env.AXTASK_PRODUCTION === "true"
  || (host && host !== "localhost" && host !== "127.0.0.1");
const VERIFY_FILE = process.argv.includes("--verify") || isProdLike;
const RETENTION_HOURS = Number(process.env.BACKUP_AIRLOCK_RETENTION_HOURS) || 168;

if (SKIP) {
  if (isProdLike && !process.env.MIGRATION_AIRLOCK_SKIP_ACK) {
    console.error("[migration-airlock] FAILED: --skip in production-like env requires MIGRATION_AIRLOCK_SKIP_ACK.");
    process.exit(1);
  }
  console.warn("[migration-airlock] WARNING: bypassed via --skip. No backup verification performed.");
  process.exit(2);
}

if (!DATABASE_URL) {
  console.error("[migration-airlock] DATABASE_URL is not set. Cannot check backup ledger.");
  process.exit(1);
}

const currentDatabaseFingerprint = databaseTargetFingerprint(DATABASE_URL);
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

function verifyFilesystemCheckpoint() {
  const manifestPath = latestDbManifest();
  if (!manifestPath || !existsSync(manifestPath)) return false;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const createdAt = manifest.createdAt ? new Date(manifest.createdAt) : null;
  const maxAgeMs = RETENTION_HOURS * 60 * 60 * 1000;
  const fresh = createdAt && Number.isFinite(createdAt.getTime())
    && Date.now() - createdAt.getTime() <= maxAgeMs;
  const kindOk = manifest.backupKind === "db_dump";
  const targetOk = targetMatches(manifest, currentDatabaseFingerprint);
  const dumpOk = manifest.dumpFile && existsSync(manifest.dumpFile) && manifest.sha256;

  if (!fresh || !kindOk || !targetOk || !dumpOk) return false;

  const actual = createHash("sha256").update(readFileSync(manifest.dumpFile)).digest("hex");
  if (actual !== manifest.sha256) return false;

  console.log(`[migration-airlock] PASSED: filesystem db_dump checkpoint for current target (${createdAt.toISOString()}).`);
  return true;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: tableRows } = await client.query(`
      SELECT to_regclass('public.backup_records') AS table_ref
    `);
    const backupTableExists = tableRows[0]?.table_ref !== null;
    if (!backupTableExists) {
      if (isProdLike && process.env.AIRLOCK_BOOTSTRAP_ALLOWED !== "true") {
        console.error("[migration-airlock] FAILED: backup_records missing in production-like env and AIRLOCK_BOOTSTRAP_ALLOWED is not true.");
        process.exit(1);
      }
      console.warn("[migration-airlock] backup_records table missing; allowing migrations because backup schema has not been created yet.");
      return;
    }

    // User account backups share this ledger. Inspect a bounded recent window
    // and select only an explicit DB dump for the current target.
    const { rows } = await client.query(`
      SELECT id, path_or_url, metadata_json, completed_at, created_at
      FROM backup_records
      WHERE status = 'completed'
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const record = rows.find((candidate) => {
      const meta = parseMetadata(candidate);
      return meta.backupKind === "db_dump"
        && targetMatches(meta, currentDatabaseFingerprint);
    });

    if (!record) {
      if (verifyFilesystemCheckpoint()) process.exit(0);
      console.error("[migration-airlock] FAILED: no recent verified DB dump for the current database target.");
      console.error("[migration-airlock] Run a fresh backup against this DATABASE_URL before migrating: npm run db:backup.");
      process.exit(1);
    }

    const completedAt = record.completed_at ? new Date(record.completed_at) : null;
    const maxAgeMs = RETENTION_HOURS * 60 * 60 * 1000;
    if (!completedAt || Date.now() - completedAt.getTime() > maxAgeMs) {
      console.error(`[migration-airlock] FAILED: most recent matching DB dump is too old (${completedAt ? completedAt.toISOString() : "unknown"}).`);
      console.error(`[migration-airlock] Retention window: ${RETENTION_HOURS} hours. Run a fresh backup first.`);
      process.exit(1);
    }

    const meta = parseMetadata(record);
    if (!meta.sha256) {
      console.error("[migration-airlock] FAILED: matching DB dump has no SHA-256 hash in metadata.");
      process.exit(1);
    }

    if (VERIFY_FILE && record.path_or_url) {
      const isBinary = meta.backupKind === "db_dump" || meta.encrypted || meta.compressed;
      let raw;
      try {
        if (record.path_or_url.startsWith("http://") || record.path_or_url.startsWith("https://")) {
          const res = await fetch(record.path_or_url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          raw = isBinary ? Buffer.from(await res.arrayBuffer()) : await res.text();
        } else {
          raw = isBinary ? await readFile(record.path_or_url) : await readFile(record.path_or_url, "utf8");
        }
      } catch (error) {
        console.error(`[migration-airlock] FAILED: could not re-read backup file: ${error.message}`);
        process.exit(1);
      }

      if (meta.encrypted && meta.encryptionMeta && process.env.BACKUP_ENCRYPTION_KEY) {
        try {
          raw = decryptBackupPayload(raw, process.env.BACKUP_ENCRYPTION_KEY);
        } catch (error) {
          console.error(`[migration-airlock] FAILED: could not decrypt backup: ${error.message}`);
          process.exit(1);
        }
      }

      if (meta.compressed && meta.compressionMeta) {
        try {
          raw = await gunzipAsync(raw);
        } catch (error) {
          console.error(`[migration-airlock] FAILED: could not decompress backup: ${error.message}`);
          process.exit(1);
        }
      }

      const actualSha256 = createHash("sha256").update(raw).digest("hex");
      if (actualSha256 !== meta.sha256) {
        console.error("[migration-airlock] FAILED: backup integrity check failed (hash mismatch).");
        console.error(`[migration-airlock]  expected: ${meta.sha256}`);
        console.error(`[migration-airlock]  actual:   ${actualSha256}`);
        process.exit(1);
      }
      console.log("[migration-airlock] Deep verification passed (SHA-256 matches). ");
    }

    console.log(`[migration-airlock] PASSED: recent verified DB dump for current target exists (${String(record.id).slice(0, 8)}…, ${completedAt.toISOString()}).`);
    process.exit(0);
  } catch (error) {
    console.error("[migration-airlock] ERROR:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
