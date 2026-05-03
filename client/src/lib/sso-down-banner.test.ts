import { describe, expect, it } from "vitest";
import {
  shouldShowSsoDownBanner,
  isSsoNotConfiguredErrorCode,
  SSO_NOT_CONFIGURED_EXACT_MESSAGES,
} from "./sso-down-banner";

describe("isSsoNotConfiguredErrorCode", () => {
  it("accepts server redirect error codes", () => {
    expect(isSsoNotConfiguredErrorCode("google_not_configured")).toBe(true);
    expect(isSsoNotConfiguredErrorCode("workos_not_configured")).toBe(true);
    expect(isSsoNotConfiguredErrorCode("replit_not_configured")).toBe(true);
  });

  it("rejects unrelated codes", () => {
    expect(isSsoNotConfiguredErrorCode("auth_failed")).toBe(false);
    expect(isSsoNotConfiguredErrorCode(null)).toBe(false);
    expect(isSsoNotConfiguredErrorCode("")).toBe(false);
  });
});

describe("shouldShowSsoDownBanner", () => {
  it("never shows when no OAuth providers are configured", () => {
    expect(
      shouldShowSsoDownBanner({
        oauthProviderCount: 0,
        oauthCallbackErrorCode: "google_not_configured",
        errorMessage: "",
      }),
    ).toBe(false);
  });

  it("shows when providers exist and callback code is a known not-configured code", () => {
    expect(
      shouldShowSsoDownBanner({
        oauthProviderCount: 1,
        oauthCallbackErrorCode: "google_not_configured",
        errorMessage: "Google sign-in is not available. Please use another sign-in method.",
      }),
    ).toBe(true);
  });

  it("does not show for generic auth errors even with providers", () => {
    expect(
      shouldShowSsoDownBanner({
        oauthProviderCount: 2,
        oauthCallbackErrorCode: null,
        errorMessage: "Authentication failed. Please try again.",
      }),
    ).toBe(false);
  });

  it("shows on exact message whitelist when code is missing", () => {
    const msg = [...SSO_NOT_CONFIGURED_EXACT_MESSAGES][0];
    expect(
      shouldShowSsoDownBanner({
        oauthProviderCount: 1,
        oauthCallbackErrorCode: null,
        errorMessage: msg,
      }),
    ).toBe(true);
  });
});
