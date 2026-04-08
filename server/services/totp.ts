import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { generateSecret, generateURI, verifySync } from "otplib";

const ISSUER = "AxTask";

function getTotpAesKey(): Buffer {
  const explicit = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (explicit) {
    let buf: Buffer;
    if (/^[0-9a-f]{64}$/i.test(explicit)) {
      buf = Buffer.from(explicit, "hex");
    } else {
      try {
        buf = Buffer.from(explicit, "base64");
      } catch {
        throw new Error("TOTP_ENCRYPTION_KEY must be 64 hex chars or valid base64 (32 bytes)");
      }
    }
    if (buf.length !== 32) {
      throw new Error("TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes");
    }
    return buf;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("TOTP_ENCRYPTION_KEY is required in production when using TOTP");
  }
  const sess = process.env.SESSION_SECRET || "dev-insecure-session";
  return createHash("sha256").update(`${sess}:axtask_totp_v1`).digest();
}

/** Encrypt Base32 TOTP secret for storage in `users.totp_secret_ciphertext`. */
export function encryptTotpSecretBase32(plainBase32: string): string {
  const key = getTotpAesKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plainBase32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptTotpSecretBase32(stored: string): string {
  const key = getTotpAesKey();
  const raw = Buffer.from(stored, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function generateTotpSecretBase32(): string {
  return generateSecret({ length: 20 });
}

export function buildTotpKeyUri(accountEmail: string, secretBase32: string): string {
  return generateURI({
    issuer: ISSUER,
    label: accountEmail,
    secret: secretBase32,
  });
}

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const normalized = String(code || "").replace(/\D/g, "").trim();
  if (normalized.length !== 6) return false;
  const result = verifySync({
    secret: secretBase32,
    token: normalized,
    epochTolerance: 30,
  });
  return result.valid === true;
}

export function verifyUserTotpFromCiphertext(ciphertext: string | null | undefined, code: string): boolean {
  if (!ciphertext?.trim()) return false;
  try {
    const secret = decryptTotpSecretBase32(ciphertext);
    return verifyTotpCode(secret, code);
  } catch {
    return false;
  }
}
