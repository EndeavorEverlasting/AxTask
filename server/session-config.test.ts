import { describe, it, expect, beforeEach, vi } from "vitest";

const DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;

describe("session-config", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SESSION_MAX_AGE_MS;
    vi.unstubAllEnvs();
  });

  it("uses 7-day default when SESSION_MAX_AGE_MS is unset", async () => {
    const { getSessionMaxAgeMs, getSessionStoreTtlSeconds } = await import("./session-config");
    expect(getSessionMaxAgeMs()).toBe(DEFAULT_MS);
    expect(getSessionStoreTtlSeconds()).toBe(Math.floor(DEFAULT_MS / 1000));
  });

  it("accepts a valid custom duration", async () => {
    vi.stubEnv("SESSION_MAX_AGE_MS", "3600000");
    const { getSessionMaxAgeMs } = await import("./session-config");
    expect(getSessionMaxAgeMs()).toBe(3600000);
  });
});
