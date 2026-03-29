/**
 * Three-tier auth provider abstraction.
 *
 * Tier 1: WorkOS AuthKit   (AUTH_PROVIDER=workos)
 * Tier 2: Google OAuth 2.0  (AUTH_PROVIDER=google)
 * Tier 3: Local Passport.js (AUTH_PROVIDER=local)
 *
 * Switching requires changing AUTH_PROVIDER in .env and restarting.
 * NO automatic failover — by design.
 */
import { WorkOS } from "@workos-inc/node";
import type { Express, Request, Response } from "express";
import { findOrCreateOAuthUser } from "./storage";
import { randomBytes } from "crypto";

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function getProvider(): "workos" | "google" | "local" {
  const p = (process.env.AUTH_PROVIDER || "workos").toLowerCase();
  if (p === "workos" || p === "google" || p === "local") return p;
  console.warn(`[auth] Unknown AUTH_PROVIDER "${p}", defaulting to "local"`);
  return "local";
}

// ── Register provider-specific routes ────────────────────────────────────────
export function registerOAuthRoutes(app: Express) {
  const provider = getProvider();
  console.log(`[auth] Active provider: ${provider}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  WorkOS AuthKit routes (Tier 1)
  // ══════════════════════════════════════════════════════════════════════════
  app.get("/api/auth/workos/login", (_req: Request, res: Response) => {
    if (provider !== "workos") {
      return res.status(400).json({ message: "WorkOS auth is not active" });
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

      // Find or create local user linked to WorkOS
      const user = await findOrCreateOAuthUser({
        email: workosUser.email,
        displayName: `${workosUser.firstName || ""} ${workosUser.lastName || ""}`.trim() || undefined,
        provider: "workos",
        providerId: workosUser.id,
      });

      // Create session via Passport
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
    if (provider !== "google") {
      return res.status(400).json({ message: "Google auth is not active" });
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: "GOOGLE_CLIENT_ID not configured" });
    }
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback";
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
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback";

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
      if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
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

      req.login(user, (err) => {
        if (err) return res.redirect("/?error=session_failed");
        res.redirect("/");
      });
    } catch (err: any) {
      console.error("[auth] Google callback error:", err.message);
      res.redirect("/?error=auth_failed");
    }
  });
}

