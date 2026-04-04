// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseCookieSecureFlag, parseForceHttps, parseNodeIsDev } from "./login-env-policy";

describe("login-env-policy (offline vs Docker vs TLS prod)", () => {
  it("treats typical local dev as non-production with relaxed HTTPS", () => {
    expect(
      parseNodeIsDev({ NODE_ENV: "development", FORCE_HTTPS: "false" } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(parseForceHttps({ FORCE_HTTPS: "false" } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      parseCookieSecureFlag({
        NODE_ENV: "development",
        FORCE_HTTPS: "false",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("matches Docker local-prod: NODE_ENV=production + FORCE_HTTPS=false → cookies work on http://localhost", () => {
    expect(
      parseNodeIsDev({ NODE_ENV: "production", FORCE_HTTPS: "false" } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(parseForceHttps({ FORCE_HTTPS: "false" } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      parseCookieSecureFlag({
        NODE_ENV: "production",
        FORCE_HTTPS: "false",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("matches TLS production: Secure cookies only when HTTPS is expected", () => {
    expect(
      parseCookieSecureFlag({
        NODE_ENV: "production",
        FORCE_HTTPS: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      parseCookieSecureFlag({
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
