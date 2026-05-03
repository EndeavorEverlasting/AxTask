import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-providers", () => ({
  getProvider: () => "local" as const,
  getAvailableProviders: () => [{ name: "google", loginUrl: "/api/auth/google/login" }],
}));

import { logBootConfigSummary } from "./boot-config-summary";
import { __resetRegistrationConfigCacheForTests } from "./registration-config";

const SECRETS: Record<string, string> = {
  INVITE_CODE: "invite-code-SECRET-abcdef",
  SESSION_SECRET: "session-secret-VALUE-xyz",
  TOTP_ENCRYPTION_KEY: "totp-key-HIDDEN-12345",
  VAPID_PRIVATE_KEY: "vapid-priv-DO-NOT-LOG",
  AUTH_AUDIT_PEPPER: "pepper-VALUE-secret",
  DATABASE_URL: "postgresql://db:SECRET_PASS@localhost:5432/app",
  GOOGLE_CLIENT_SECRET: "google-client-SECRET-abc",
  WORKOS_API_KEY: "workos-api-KEY-secret",
};

function captureConsole(cb: () => void): string {
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  try {
    cb();
  } finally {
    logSpy.mockRestore();
    infoSpy.mockRestore();
  }
  return lines.join("\n");
}

describe("boot-config-summary", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    __resetRegistrationConfigCacheForTests();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REGISTRATION_MODE", "invite");
    vi.stubEnv("SESSION_MAX_AGE_MS", "604800000");
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub-nonsecret-placeholder");
    for (const [k, v] of Object.entries(SECRETS)) {
      vi.stubEnv(k, v);
    }
    __resetRegistrationConfigCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    __resetRegistrationConfigCacheForTests();
  });

  it("never echoes configured secret values in human or JSON output", () => {
    const out = captureConsole(() => logBootConfigSummary());
    for (const v of Object.values(SECRETS)) {
      expect(out.indexOf(v)).toBe(-1);
    }
    expect(out).toContain("[auth] registration mode: invite");
    expect(out).toContain('"event":"axtask.boot.config"');
    expect(out).toContain('"inviteStrength":"ok"');
  });

  it("does not log when NODE_ENV is test", () => {
    vi.stubEnv("NODE_ENV", "test");
    __resetRegistrationConfigCacheForTests();
    const out = captureConsole(() => logBootConfigSummary());
    expect(out).toBe("");
  });
});
