import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseRegistrationConfig, inviteConfiguredForClient } from "./registration-config";

function env(partial: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return partial as NodeJS.ProcessEnv;
}

describe("registration-config", () => {
  it("defaults production to invite when REGISTRATION_MODE unset", () => {
    const c = parseRegistrationConfig(env({ NODE_ENV: "production" }));
    expect(c.mode).toBe("invite");
    expect(c.inviteCode).toBe("");
    expect(c.rawModeWasUnknown).toBe(false);
    expect(inviteConfiguredForClient(c)).toBe(false);
  });

  it("defaults development to open when REGISTRATION_MODE unset", () => {
    const c = parseRegistrationConfig(env({ NODE_ENV: "development" }));
    expect(c.mode).toBe("open");
    expect(inviteConfiguredForClient(c)).toBe(true);
  });

  it("normalizes case and whitespace on mode", () => {
    const c = parseRegistrationConfig(
      env({ NODE_ENV: "production", REGISTRATION_MODE: "  OPEN  " }),
    );
    expect(c.mode).toBe("open");
    expect(c.rawModeWasUnknown).toBe(false);
  });

  it("trims INVITE_CODE including embedded newline", () => {
    const c = parseRegistrationConfig(
      env({ NODE_ENV: "production", REGISTRATION_MODE: "invite", INVITE_CODE: "  abcd1234\n" }),
    );
    expect(c.inviteCode).toBe("abcd1234");
    expect(c.inviteCodeWeak).toBe(false);
  });

  it("flags weak invite code in invite mode", () => {
    const c = parseRegistrationConfig(
      env({ NODE_ENV: "production", REGISTRATION_MODE: "invite", INVITE_CODE: "short" }),
    );
    expect(c.inviteCode).toBe("short");
    expect(c.inviteCodeWeak).toBe(true);
  });

  it("unknown mode falls back to invite in production", () => {
    const c = parseRegistrationConfig(
      env({ NODE_ENV: "production", REGISTRATION_MODE: "banana" }),
    );
    expect(c.mode).toBe("invite");
    expect(c.rawModeWasUnknown).toBe(true);
    expect(c.rawRegistrationModeEnv).toBe("banana");
  });

  it("unknown mode falls back to open in development", () => {
    const c = parseRegistrationConfig(
      env({ NODE_ENV: "development", REGISTRATION_MODE: "x" }),
    );
    expect(c.mode).toBe("open");
    expect(c.rawModeWasUnknown).toBe(true);
  });

  it("getRegistrationConfig is memoized until cache reset", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REGISTRATION_MODE", "closed");
    const { getRegistrationConfig, __resetRegistrationConfigCacheForTests } = await import(
      "./registration-config"
    );
    expect(getRegistrationConfig().mode).toBe("closed");
    vi.stubEnv("REGISTRATION_MODE", "open");
    expect(getRegistrationConfig().mode).toBe("closed");
    __resetRegistrationConfigCacheForTests();
    expect(getRegistrationConfig().mode).toBe("open");
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
