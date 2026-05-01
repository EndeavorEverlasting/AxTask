import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;

function getKeyMaterial(): string {
  const k = process.env.CONVERSION_ARTIFACT_ENCRYPTION_KEY?.trim();
  if (!k) return "";
  return k;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32);
}

/** Returns ciphertext: salt(16) | iv(12) | tag(16) | enc(...) */
export function sealConversionPayload(plaintextJson: string): { blob: Buffer; keyRef: string } | null {
  const material = getKeyMaterial();
  if (!material) return null;
  const salt = randomBytes(SALT_LEN);
  const key = deriveKey(material, salt);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintextJson, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([salt, iv, tag, enc]);
  return { blob, keyRef: "scrypt:v1" };
}

export function openConversionPayload(blob: Buffer): string | null {
  const material = getKeyMaterial();
  if (!material || blob.length < SALT_LEN + IV_LEN + TAG_LEN + 1) return null;
  const salt = blob.subarray(0, SALT_LEN);
  const iv = blob.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = blob.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const data = blob.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(material, salt);
  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
