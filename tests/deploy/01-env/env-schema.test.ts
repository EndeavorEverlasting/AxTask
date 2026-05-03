/**
 * Contract: check-env.mjs validates required env vars correctly.
 */
import { describe, expect, it } from "vitest";
import { validateEnv } from "../../../scripts/deploy/check-env.mjs";

describe("[01-env] check-env.validateEnv (dev profile)", () => {
  it("fails when DATABASE_URL is missing", () => {
    const result = validateEnv({ SESSION_SECRET: "x".repeat(32) }, { isProd: false });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => /DATABASE_URL/.test(e))).toBe(true);
  });

  it("fails when SESSION_SECRET is too short", () => {
    const result = validateEnv(
      { DATABASE_URL: "postgres://u:p@h:5432/d", SESSION_SECRET: "short" },
      { isProd: false },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => /SESSION_SECRET/.test(e))).toBe(true);
  });

  it("fails when DATABASE_URL has the wrong scheme", () => {
    const result = validateEnv(
      { DATABASE_URL: "mysql://u:p@h:3306/d", SESSION_SECRET: "x".repeat(32) },
      { isProd: false },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => /postgres/i.test(e))).toBe(true);
  });

  it("passes with minimum valid dev config", () => {
    const result = validateEnv(
      { DATABASE_URL: "postgres://u:p@h:5432/d", SESSION_SECRET: "x".repeat(32) },
      { isProd: false },
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("[01-env] check-env.validateEnv (prod profile)", () => {
  const baseProdEnv: Record<string, string> = {
    DATABASE_URL: "postgres://u:p@h:5432/d",
    SESSION_SECRET: "x".repeat(32),
    NODE_ENV: "production",
    AUTH_AUDIT_PEPPER: "x".repeat(24),
    ARCHETYPE_ANALYTICS_SALT: "x".repeat(16),
    TOTP_ENCRYPTION_KEY: "a".repeat(64),
    REGISTRATION_MODE: "open",
  };

  it("rejects NODE_ENV=development in prod profile", () => {
    const result = validateEnv(
      { ...baseProdEnv, NODE_ENV: "development" },
      { isProd: true },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => /NODE_ENV/.test(e))).toBe(true);
  });

  it("accepts valid prod config", () => {
    const result = validateEnv(baseProdEnv, { isProd: true });
    expect(result.ok).toBe(true);
  });

  it("warns when CANONICAL_HOST is missing", () => {
    const result = validateEnv(baseProdEnv, { isProd: true });
    expect(result.warnings.some((w: string) => /CANONICAL_HOST/.test(w))).toBe(true);
  });

  it("respects AXTASK_ENV_IGNORE_MISSING", () => {
    const result = validateEnv(
      {
        AXTASK_ENV_IGNORE_MISSING: "SESSION_SECRET",
        DATABASE_URL: "postgres://u:p@h:5432/d",
        NODE_ENV: "production",
        AUTH_AUDIT_PEPPER: "x".repeat(24),
        ARCHETYPE_ANALYTICS_SALT: "x".repeat(16),
        TOTP_ENCRYPTION_KEY: "a".repeat(64),
        REGISTRATION_MODE: "open",
      },
      { isProd: true },
    );
    expect(result.errors.some((e: string) => /SESSION_SECRET/.test(e))).toBe(false);
  });

  it("fails when prod invite mode has no INVITE_CODE", () => {
    const result = validateEnv(
      { ...baseProdEnv, REGISTRATION_MODE: "invite", INVITE_CODE: "" },
      { isProd: true },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => /INVITE_CODE/.test(e))).toBe(true);
  });

  it("fails when prod defaults to invite (unset REGISTRATION_MODE) without INVITE_CODE", () => {
    const env = { ...baseProdEnv };
    delete env.REGISTRATION_MODE;
    delete env.INVITE_CODE;
    const result = validateEnv(env, { isProd: true });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => /INVITE_CODE/.test(e))).toBe(true);
  });

  it("passes prod default invite when INVITE_CODE is long enough", () => {
    const env = { ...baseProdEnv };
    delete env.REGISTRATION_MODE;
    env.INVITE_CODE = "x".repeat(8);
    expect(validateEnv(env, { isProd: true }).ok).toBe(true);
  });

  it("rejects unknown REGISTRATION_MODE in prod", () => {
    const result = validateEnv(
      { ...baseProdEnv, REGISTRATION_MODE: "banana" },
      { isProd: true },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => /REGISTRATION_MODE/.test(e))).toBe(true);
  });

  it("fails when ARCHETYPE_ANALYTICS_SALT is too short", () => {
    const result = validateEnv(
      { ...baseProdEnv, ARCHETYPE_ANALYTICS_SALT: "short" },
      { isProd: true },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => /ARCHETYPE_ANALYTICS_SALT/.test(e))).toBe(true);
  });

  it("fails when TOTP_ENCRYPTION_KEY is not 64 hex chars", () => {
    const result = validateEnv(
      { ...baseProdEnv, TOTP_ENCRYPTION_KEY: "not-hex" },
      { isProd: true },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => /TOTP_ENCRYPTION_KEY/.test(e))).toBe(true);
  });

  it("fails when only one VAPID key is set", () => {
    const result = validateEnv(
      { ...baseProdEnv, VAPID_PUBLIC_KEY: "pub" },
      { isProd: true },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => /VAPID/.test(e))).toBe(true);
  });

  it("passes when all three VAPID keys are set", () => {
    const result = validateEnv(
      {
        ...baseProdEnv,
        VAPID_PUBLIC_KEY: "pubkey",
        VAPID_PRIVATE_KEY: "privkey",
        VITE_VAPID_PUBLIC_KEY: "pubkey",
      },
      { isProd: true },
    );
    expect(result.ok).toBe(true);
  });
});
