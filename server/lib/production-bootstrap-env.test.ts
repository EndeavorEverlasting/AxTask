// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertProductionAuthAuditPepper } from "./production-bootstrap-env";

describe("assertProductionAuthAuditPepper", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing when NODE_ENV is not production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_AUDIT_PEPPER", "");
    expect(() => assertProductionAuthAuditPepper()).not.toThrow();
  });

  it("throws in production when AUTH_AUDIT_PEPPER is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_AUDIT_PEPPER", "");
    expect(() => assertProductionAuthAuditPepper()).toThrow(
      "AUTH_AUDIT_PEPPER must be set (min 16 characters) in production for login audit hashing",
    );
  });

  it("throws in production when pepper is only whitespace", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_AUDIT_PEPPER", "   \t  ");
    expect(() => assertProductionAuthAuditPepper()).toThrow(
      "AUTH_AUDIT_PEPPER must be set (min 16 characters) in production for login audit hashing",
    );
  });

  it("throws in production when pepper is shorter than 16 characters", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_AUDIT_PEPPER", "short_pepper_15");
    expect(() => assertProductionAuthAuditPepper()).toThrow(
      "AUTH_AUDIT_PEPPER must be set (min 16 characters) in production for login audit hashing",
    );
  });

  it("accepts production when pepper has at least 16 characters", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_AUDIT_PEPPER", "sixteen_chars_ok");
    expect(() => assertProductionAuthAuditPepper()).not.toThrow();
  });
});
