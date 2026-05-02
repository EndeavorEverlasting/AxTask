/**
 * Backup encryption utilities using AES-256-GCM.
 *
 * When BACKUP_ENCRYPTION_KEY is set, JSON bundles are encrypted before
 * writing to any target (local or S3). The key must be a 32-byte hex string
 * or a base64-encoded 32-byte raw key. Encryption metadata (iv, authTag)
 * is stored alongside the backup record so verification can decrypt first.
 *
 * Decryption is required for:
 * - verifyBackupByRecord (recompute plaintext hash)
 * - migration-airlock (deep --verify mode)
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";

const AES_256_GCM_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;   // bytes
const TAG_LENGTH = 16;  // bytes
const KEY_LENGTH = 32;  // bytes

export type BackupEncryptionMeta = {
  encrypted: true;
  iv: string;        // base64
  authTag: string;   // base64
  keyHash: string;   // SHA-256 of the raw key (for key-change detection)
};

function normalizeKey(keyInput: string): Buffer {
  // If the key is exactly 64 hex chars, treat it as hex
  if (/^[0-9a-fA-F]{64}$/.test(keyInput)) {
    return Buffer.from(keyInput, "hex");
  }
  // If the key is base64 and decodes to 32 bytes, use it directly
  const b64 = Buffer.from(keyInput, "base64");
  if (b64.length === KEY_LENGTH) {
    return b64;
  }
  // Otherwise derive a 32-byte key with scrypt (deterministic for same input)
  return scryptSync(keyInput, "axtask-backup-salt", KEY_LENGTH);
}

function keyHash(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * Encrypt plaintext (Buffer or string) using AES-256-GCM.
 * Returns a Buffer payload that concatenates iv + authTag + ciphertext.
 */
export function encryptBackup(plaintext: Buffer | string, keyInput: string): {
  payload: Buffer;
  meta: BackupEncryptionMeta;
} {
  const key = normalizeKey(keyInput);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_256_GCM_ALGORITHM, key, iv);
  const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8");
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Concatenated blob: iv (16) + authTag (16) + ciphertext (var)
  const payload = Buffer.concat([iv, authTag, encrypted]);

  return {
    payload,
    meta: {
      encrypted: true,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      keyHash: keyHash(key),
    },
  };
}

/**
 * Decrypt a payload produced by encryptBackup.
 * Accepts Buffer or base64 string. Returns a Buffer (caller must toString if needed).
 */
export function decryptBackup(payload: Buffer | string, keyInput: string): Buffer {
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
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted;
}

/**
 * Derive a stable encryption key from a user-supplied passphrase.
 * Not as strong as a random 32-byte key, but convenient for human-memorable
 * passwords. Prefer BACKUP_ENCRYPTION_KEY containing 64 hex chars.
 */
export function deriveKeyFromPassphrase(passphrase: string): string {
  const key = scryptSync(passphrase, "axtask-backup-salt", KEY_LENGTH);
  return key.toString("hex");
}

// ─── Compression helpers ────────────────────────────────────────────────────

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export type BackupCompressionMeta = {
  compressed: true;
  algorithm: "gzip";
};

/**
 * Compress a string with gzip (level 6). Returns a Buffer.
 */
export async function compressBackup(plaintext: string): Promise<{
  payload: Buffer;
  meta: BackupCompressionMeta;
}> {
  const compressed = await gzipAsync(Buffer.from(plaintext, "utf8"), { level: 6 });
  return {
    payload: compressed,
    meta: { compressed: true, algorithm: "gzip" },
  };
}

/**
 * Decompress a payload produced by compressBackup.
 * Accepts Buffer or base64 string. Returns utf8 string.
 */
export async function decompressBackup(payload: Buffer | string): Promise<string> {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "base64");
  const decompressed = await gunzipAsync(buf);
  return decompressed.toString("utf8");
}
