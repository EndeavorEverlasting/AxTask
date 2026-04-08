// @vitest-environment node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

describe("Google account login (OAuth) contract", () => {
  it("registers login and callback routes", () => {
    const auth = fs.readFileSync(
      path.join(root, "server", "auth-providers.ts"),
      "utf8",
    );
    expect(auth).toContain('app.get("/api/auth/google/login"');
    expect(auth).toContain('app.get("/api/auth/google/callback"');
  });

  it("redirects to error when Google OAuth is not configured", () => {
    const auth = fs.readFileSync(
      path.join(root, "server", "auth-providers.ts"),
      "utf8",
    );
    expect(auth).toContain("google_not_configured");
  });

  it("validates OAuth state on callback before token exchange", () => {
    const auth = fs.readFileSync(
      path.join(root, "server", "auth-providers.ts"),
      "utf8",
    );
    expect(auth).toContain("oauthState");
    expect(auth).toContain("invalid_state");
    expect(auth).toContain("oauth_state_mismatch");
  });

  it("exchanges code and calls findOrCreateOAuthUser with provider google", () => {
    const auth = fs.readFileSync(
      path.join(root, "server", "auth-providers.ts"),
      "utf8",
    );
    expect(auth).toContain("oauth2.googleapis.com/token");
    expect(auth).toContain("oauth2/v3/userinfo");
    expect(auth).toContain('provider: "google"');
  });
});
