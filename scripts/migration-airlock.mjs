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
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

const gunzipAsync = promisify(gunzip);

const AES_256_GCM_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function normalizeKey(keyInput) {
  if (/^[0-9a-fA-F]{64}$/.test(keyInput)) {
    return Buffer.from(keyInput, "hex");
  }
  const b64 = Buffer.from(keyInput, "base64");
  if (b64.length === KEY_LENGTH) {
    return b64;
  }
  return scryptSync(keyInput, "axtask-backup-salt", KEY_LENGTH);
}

function decryptBackupPayload(payload, keyInput) {
  const key = normalizeKey(keyInput);
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Backup payload too short to contain iv + authTag");
  }
  const iv = buf.slice(0, IV_LENGTH);
  const authTag = buf.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.slice(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(AES_256_GCM_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

const SKIP = process.argv.includes("--skip") || process.argv.includes("--skip-airlock");
const VERIFY_FILE = process.argv.includes("--verify");
const RETENTION_HOURS = Number(process.env.BACKUP_AIRLOCK_RETENTION_HOURS) || 168; // 7 days default

if (SKIP) {
  console.warn("[migration-airlock] WARNING: bypassed via --skip. No backup verification performed.");
  process.exit(2);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migration-airlock] DATABASE_URL is not set. Cannot check backup ledger.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

async function main() {
  const client = await pool.connect();
  try {
    // Query most recent completed backup record
    const { rows } = await client.query(`
      SELECT id, path_or_url, metadata_json, completed_at, created_at
      FROM backup_records
      WHERE status = 'completed'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (rows.length === 0) {
      console.error("[migration-airlock] FAILED: no completed backup records found.");
      console.error("[migration-airlock] Run a backup before migrating: ensure BACKUP_SCHEDULER_ENABLED=true or manually trigger one.");
      process.exit(1);
    }

    const record = rows[0];
    const completedAt = record.completed_at ? new Date(record.completed_at) : null;
    const now = new Date();
    const maxAgeMs = RETENTION_HOURS * 60 * 60 * 1000;

    if (!completedAt || (now.getTime() - completedAt.getTime()) > maxAgeMs) {
      console.error(`[migration-airlock] FAILED: most recent backup is too old (${completedAt ? completedAt.toISOString() : "unknown"}).`);
      console.error(`[migration-airlock] Retention window: ${RETENTION_HOURS} hours. Run a fresh backup before migrating.`);
      process.exit(1);
    }

    // Check SHA-256 hash exists in metadata
    let meta = {};
    try {
      meta = JSON.parse(record.metadata_json || "{}");
    } catch {
      /* ignore parse errors */
    }

    if (!meta.sha256) {
      console.error("[migration-airlock] FAILED: most recent backup has no SHA-256 hash in metadata.");
      console.error("[migration-airlock] Backups without hashes cannot be integrity-checked. Run a fresh backup first.");
      process.exit(1);
    }

    // Optional deep verification: re-read the file and check the hash
    if (VERIFY_FILE && record.path_or_url) {
      let raw;
      try {
        if (record.path_or_url.startsWith("http://") || record.path_or_url.startsWith("https://")) {
          const res = await fetch(record.path_or_url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          raw = await res.text();
        } else {
          raw = await readFile(record.path_or_url, "utf8");
        }
      } catch (e) {
        console.error(`[migration-airlock] FAILED: could not re-read backup file: ${e.message}`);
        process.exit(1);
      }

      // Decrypt if the backup was encrypted
      if (meta.encrypted && meta.encryptionMeta && process.env.BACKUP_ENCRYPTION_KEY) {
        try {
          raw = decryptBackupPayload(raw, process.env.BACKUP_ENCRYPTION_KEY);
        } catch (e) {
          console.error(`[migration-airlock] FAILED: could not decrypt backup: ${e.message}`);
          process.exit(1);
        }
      }

      // Decompress if the backup was compressed (after decryption)
      if (meta.compressed && meta.compressionMeta) {
        try {
          const buf = Buffer.from(raw, "base64");
          const decompressed = await gunzipAsync(buf);
          raw = decompressed.toString("utf8");
        } catch (e) {
          console.error(`[migration-airlock] FAILED: could not decompress backup: ${e.message}`);
          process.exit(1);
        }
      }

      const actualSha256 = createHash("sha256").update(raw, "utf8").digest("hex");
      if (actualSha256 !== meta.sha256) {
        console.error("[migration-airlock] FAILED: backup integrity check failed (hash mismatch).");
        console.error(`[migration-airlock]  expected: ${meta.sha256}`);
        console.error(`[migration-airlock]  actual:   ${actualSha256}`);
        process.exit(1);
      }
      console.log("[migration-airlock] Deep verification passed (SHA-256 matches).");
    }

    console.log(`[migration-airlock] PASSED: recent verified backup exists (${record.id.slice(0, 8)}…, ${completedAt.toISOString()}).`);
    process.exit(0);
  } catch (err) {
    console.error("[migration-airlock] ERROR:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
