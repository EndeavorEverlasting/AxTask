import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptTotpSecretBase32, decryptTotpSecretBase32, verifyTotpCode, generateTotpSecretBase32 } from "./totp";
import { generateSync, verifySync } from "otplib";

describe("totp service", () => {
  const prevKey = process.env.TOTP_ENCRYPTION_KEY;
  const prevSess = process.env.SESSION_SECRET;
  const prevNode = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.TOTP_ENCRYPTION_KEY = "a".repeat(64);
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = prevKey;
    if (prevSess === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSess;
    process.env.NODE_ENV = prevNode ?? "test";
  });

  it("round-trips AES-GCM ciphertext", () => {
    const plain = generateTotpSecretBase32();
    const enc = encryptTotpSecretBase32(plain);
    expect(enc).not.toContain(plain);
    expect(decryptTotpSecretBase32(enc)).toBe(plain);
  });

  it("verifies a fresh TOTP code", () => {
    const secret = generateTotpSecretBase32();
    const token = generateSync({ secret });
    expect(verifyTotpCode(secret, token)).toBe(true);
    expect(verifySync({ secret, token, epochTolerance: 30 }).valid).toBe(true);
  });
});
