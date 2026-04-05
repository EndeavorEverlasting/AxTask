import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleSheetsClient, googleAuthUtils, googleSheetsClient } from "./google-api";

describe("googleAuthUtils", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("extractCodeFromUrl", () => {
    it("returns code from standard OAuth redirect query", () => {
      const url =
        "http://localhost:5000/sync?code=abc123&scope=sheets";
      expect(googleAuthUtils.extractCodeFromUrl(url)).toBe("abc123");
    });

    it("returns null when code is absent", () => {
      expect(
        googleAuthUtils.extractCodeFromUrl("http://localhost:5000/sync?state=xyz"),
      ).toBeNull();
    });
  });

  describe("storeTokens / getStoredTokens / clearTokens", () => {
    it("round-trips valid tokens", () => {
      const tokens = { accessToken: "at", refreshToken: "rt" };
      googleAuthUtils.storeTokens(tokens);
      expect(googleAuthUtils.getStoredTokens()).toEqual(tokens);
      googleAuthUtils.clearTokens();
      expect(googleAuthUtils.getStoredTokens()).toBeNull();
    });

    it("removes corrupt JSON and returns null", () => {
      localStorage.setItem("google_auth_tokens", "{not-json");
      expect(googleAuthUtils.getStoredTokens()).toBeNull();
      expect(localStorage.getItem("google_auth_tokens")).toBeNull();
    });

    it("rejects object missing refreshToken and clears storage", () => {
      localStorage.setItem(
        "google_auth_tokens",
        JSON.stringify({ accessToken: "only" }),
      );
      expect(googleAuthUtils.getStoredTokens()).toBeNull();
      expect(localStorage.getItem("google_auth_tokens")).toBeNull();
    });
  });

  describe("areTokensValid", () => {
    it("requires both access and refresh tokens", () => {
      expect(googleAuthUtils.areTokensValid(null)).toBe(false);
      expect(
        googleAuthUtils.areTokensValid({
          accessToken: "",
          refreshToken: "r",
        }),
      ).toBe(false);
      expect(
        googleAuthUtils.areTokensValid({
          accessToken: "a",
          refreshToken: "r",
        }),
      ).toBe(true);
    });
  });
});

describe("GoogleSheetsClient (fetch)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("checkCredentials returns configured true when auth-url is OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response),
    );
    const client = new GoogleSheetsClient();
    const result = await client.checkCredentials();
    expect(result.configured).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/google-sheets/auth-url");
  });

  it("checkCredentials returns message from JSON when not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Set GOOGLE_CLIENT_ID" }),
      } as Response),
    );
    const client = new GoogleSheetsClient();
    const result = await client.checkCredentials();
    expect(result.configured).toBe(false);
    expect(result.message).toContain("GOOGLE_CLIENT_ID");
  });

  it("getAuthUrl returns authUrl from API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          authUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
        }),
      } as Response),
    );
    const client = new GoogleSheetsClient();
    const url = await client.getAuthUrl();
    expect(url).toContain("accounts.google.com");
  });

  it("default googleSheetsClient is constructable", () => {
    expect(googleSheetsClient.getConfig()).toEqual({});
  });

  it("getSpreadsheetInfo throws with status and server message on error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "Insufficient scope" }),
      } as Response),
    );
    const client = new GoogleSheetsClient();
    await expect(
      client.getSpreadsheetInfo("sheetId", {
        accessToken: "t",
        refreshToken: "r",
      }),
    ).rejects.toThrow(/HTTP 403.*Insufficient scope/s);
  });
});
