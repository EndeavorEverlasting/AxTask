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
  const baseProdEnv = {
    DATABASE_URL: "postgres://u:p@h:5432/d",
    SESSION_SECRET: "x".repeat(32),
    NODE_ENV: "production",
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
      },
      { isProd: true },
    );
    expect(result.errors.some((e: string) => /SESSION_SECRET/.test(e))).toBe(false);
  });
});
