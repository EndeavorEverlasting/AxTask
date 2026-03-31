/**
 * Multi-provider auth abstraction.
 *
 * Supported providers (set AUTH_PROVIDER in .env):
 *   "google"  — Google OAuth 2.0
 *   "workos"  — WorkOS AuthKit
 *   "replit"  — Replit OIDC (Google/GitHub/Apple via Replit)
 *   "local"   — Passport.js (email + password)
 *
 * Switching requires changing AUTH_PROVIDER in .env and restarting.
 */
import { WorkOS } from "@workos-inc/node";
import * as oidcClient from "openid-client";
import type { Express, Request, Response } from "express";
import { findOrCreateOAuthUser, isUserBanned, logSecurityEvent } from "./storage";
import { randomBytes } from "crypto";
import memoize from "memoizee";

// ── WorkOS singleton (only initialized when needed) ──────────────────────────
let _workos: WorkOS | null = null;
function getWorkOS(): WorkOS {
  if (!_workos) {
    const apiKey = process.env.WORKOS_API_KEY;
    if (!apiKey) throw new Error("[auth] WORKOS_API_KEY is not set");
    _workos = new WorkOS(apiKey, { clientId: process.env.WORKOS_CLIENT_ID });
  }
  return _workos;
}

// ── Replit OIDC config (memoized) ────────────────────────────────────────────
const getReplitOidcConfig = memoize(
  async () => {
    return await oidcClient.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!,
    );
  },
  { maxAge: 3600 * 1000 },
);

// ── Helpers ──────────────────────────────────────────────────────────────────
export function getProvider(): "workos" | "google" | "replit" | "local" {
  const explicit = process.env.AUTH_PROVIDER?.toLowerCase();

  if (explicit) {
    if (explicit === "workos" || explicit === "google" || explicit === "replit" || explicit === "local") return explicit;
    console.warn(`[auth] Unknown AUTH_PROVIDER "${explicit}", falling through to auto-detect`);
  }

  if (process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID) return "workos";
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return "google";
  if (process.env.REPL_ID) return "replit";
  return "local";
}

export type ProviderInfo = { name: string; loginUrl: string };

export function getAvailableProviders(): ProviderInfo[] {
  const available: ProviderInfo[] = [];
  if (process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID) {
    available.push({ name: "workos", loginUrl: "/api/auth/workos/login" });
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    available.push({ name: "google", loginUrl: "/api/auth/google/login" });
  }
  if (process.env.REPL_ID) {
    available.push({ name: "replit", loginUrl: "/api/auth/replit/login" });
  }
  return available;
}

// ── Register provider-specific routes ────────────────────────────────────────
export function registerOAuthRoutes(app: Express) {
  const provider = getProvider();
  const available = getAvailableProviders();
  console.log(`[auth] Primary provider: ${provider}`);
  console.log(`[auth] Available providers: ${available.map(p => p.name).join(", ") || "local only"}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  WorkOS AuthKit routes (Tier 1)
  // ══════════════════════════════════════════════════════════════════════════
  app.get("/api/auth/workos/login", (_req: Request, res: Response) => {
    if (!process.env.WORKOS_API_KEY || !process.env.WORKOS_CLIENT_ID) {
      return res.redirect("/?error=workos_not_configured");
    }
    try {
      const workos = getWorkOS();
      const redirectUri = process.env.WORKOS_REDIRECT_URI || "http://localhost:5000/api/auth/callback";
      // Generate a random state to prevent CSRF
      const state = randomBytes(24).toString("base64url");
      // Store state in session for verification
      ((_req as any).session as any).oauthState = state;

      const authorizationUrl = workos.userManagement.getAuthorizationUrl({
        provider: "authkit",
        redirectUri,
        state,
        clientId: process.env.WORKOS_CLIENT_ID!,
      });
      res.redirect(authorizationUrl);
    } catch (err: any) {
      console.error("[auth] WorkOS login error:", err.message);
      res.status(500).json({ message: "Failed to initiate WorkOS login" });
    }
  });

  // WorkOS callback
  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    if (!code) {
      return res.redirect("/?error=missing_code");
    }
    try {
      const workos = getWorkOS();
      const { user: workosUser } = await workos.userManagement.authenticateWithCode({
        code,
        clientId: process.env.WORKOS_CLIENT_ID!,
      });

      const user = await findOrCreateOAuthUser({
        email: workosUser.email,
        displayName: `${workosUser.firstName || ""} ${workosUser.lastName || ""}`.trim() || undefined,
        provider: "workos",
        providerId: workosUser.id,
      });

      const banStatus = await isUserBanned(workosUser.email);
      if (banStatus.banned) {
        await logSecurityEvent("login_banned_attempt", undefined, undefined, req.ip, `Banned user tried OAuth login: ${workosUser.email}`);
        return res.redirect("/?error=account_suspended");
      }

      req.login(user, (err) => {
        if (err) {
          console.error("[auth] Session creation error:", err);
          return res.redirect("/?error=session_failed");
        }
        res.redirect("/");
      });
    } catch (err: any) {
      console.error("[auth] WorkOS callback error:", err.message);
      res.redirect("/?error=auth_failed");
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  Google OAuth 2.0 routes (Tier 2)
  // ══════════════════════════════════════════════════════════════════════════
  app.get("/api/auth/google/login", (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect("/?error=google_not_configured");
    }
    const origin = `${req.protocol}://${req.get("host")}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;
    const state = randomBytes(24).toString("base64url");
    ((req as any).session as any).oauthState = state;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      state,
      prompt: "select_account",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    if (!code) return res.redirect("/?error=missing_code");

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
      const origin = `${req.protocol}://${req.get("host")}`;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error("[auth] Google token exchange response:", errBody);
        console.error("[auth] Redirect URI used:", redirectUri);
        throw new Error(`Token exchange failed: ${tokenRes.status}`);
      }
      const tokens = (await tokenRes.json()) as { id_token?: string; access_token: string };

      // Get user info
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!userInfoRes.ok) throw new Error(`UserInfo failed: ${userInfoRes.status}`);
      const gUser = (await userInfoRes.json()) as { sub: string; email: string; name?: string };

      const user = await findOrCreateOAuthUser({
        email: gUser.email,
        displayName: gUser.name,
        provider: "google",
        providerId: gUser.sub,
      });

      const banStatus = await isUserBanned(gUser.email);
      if (banStatus.banned) {
        await logSecurityEvent("login_banned_attempt", undefined, undefined, req.ip, `Banned user tried Google login: ${gUser.email}`);
        return res.redirect("/?error=account_suspended");
      }

      req.login(user, (err) => {
        if (err) return res.redirect("/?error=session_failed");
        res.redirect("/");
      });
    } catch (err: any) {
      console.error("[auth] Google callback error:", err.message);
      res.redirect("/?error=auth_failed");
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  Replit OIDC routes (Google/GitHub/Apple via Replit identity)
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/auth/replit/login", async (req: Request, res: Response) => {
    if (!process.env.REPL_ID) {
      return res.redirect("/?error=replit_not_configured");
    }
    try {
      const config = await getReplitOidcConfig();
      const state = randomBytes(24).toString("base64url");
      const nonce = randomBytes(24).toString("base64url");
      const codeVerifier = oidcClient.randomPKCECodeVerifier();
      const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);

      (req.session as any).oauthState = state;
      (req.session as any).oauthNonce = nonce;
      (req.session as any).pkceCodeVerifier = codeVerifier;

      const origin = `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${origin}/api/auth/replit/callback`;
      const params = new URLSearchParams({
        response_type: "code",
        client_id: process.env.REPL_ID!,
        redirect_uri: redirectUri,
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        prompt: "login consent",
      });

      const authEndpoint = config.serverMetadata().authorization_endpoint;
      if (!authEndpoint) throw new Error("No authorization endpoint in OIDC config");
      res.redirect(`${authEndpoint}?${params}`);
    } catch (err: any) {
      console.error("[auth] Replit OIDC login error:", err.message);
      res.status(500).json({ message: "Failed to initiate Replit login" });
    }
  });

  app.get("/api/auth/replit/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    if (!code) return res.redirect("/?error=missing_code");

    try {
      const config = await getReplitOidcConfig();
      const origin = `${req.protocol}://${req.get("host")}`;
      const currentUrl = new URL(req.url, origin);

      const tokens = await oidcClient.authorizationCodeGrant(config, currentUrl, {
        expectedState: (req.session as any).oauthState,
        expectedNonce: (req.session as any).oauthNonce,
        pkceCodeVerifier: (req.session as any).pkceCodeVerifier,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims || !claims.email) {
        throw new Error("No email claim in OIDC response");
      }

      const displayName = [claims.first_name, claims.last_name].filter(Boolean).join(" ") || (claims.email as string).split("@")[0];

      const user = await findOrCreateOAuthUser({
        email: claims.email as string,
        displayName,
        profileImageUrl: claims.profile_image_url as string | undefined,
        provider: "replit",
        providerId: claims.sub,
      });

      delete (req.session as any).oauthState;
      delete (req.session as any).oauthNonce;
      delete (req.session as any).pkceCodeVerifier;

      const banStatus = await isUserBanned(claims.email as string);
      if (banStatus.banned) {
        await logSecurityEvent("login_banned_attempt", undefined, undefined, req.ip, `Banned user tried Replit login: ${claims.email}`);
        return res.redirect("/?error=account_suspended");
      }

      req.login(user, (err) => {
        if (err) {
          console.error("[auth] Replit session error:", err);
          return res.redirect("/?error=session_failed");
        }
        res.redirect("/");
      });
    } catch (err: any) {
      console.error("[auth] Replit OIDC callback error:", err.message);
      res.redirect("/?error=auth_failed");
    }
  });
}

