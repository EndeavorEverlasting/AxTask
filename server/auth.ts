import { randomBytes } from "crypto";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { getUserByEmail, getUserById, verifyPassword } from "./storage";
import { parseCookieSecureFlag } from "./lib/login-env-policy";
import type { Express, Request, Response, NextFunction } from "express";
import type { SafeUser } from "@shared/schema";

// Extend Express types so req.user is typed
declare global {
  namespace Express {
    interface User extends SafeUser {}
  }
}

declare module "express-session" {
  interface SessionData {
    /** Unix ms; admin API access allowed until this time (production MFA step-up). */
    adminStepUpExpiresAt?: number;
  }
}

// ── Session secret management ───────────────────────────────────────────────
function resolveSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }

  if (isProd) {
    console.error(
      "[FATAL] SESSION_SECRET must be set to a random string ≥ 32 characters in production.\n" +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
    );
    process.exit(1);
  }

  // Dev mode: generate an ephemeral secret — valid only for this process lifetime
  const ephemeral = randomBytes(48).toString("base64url");
  console.warn(
    "[auth] No SESSION_SECRET set or too short — using ephemeral secret (sessions won't survive restart)"
  );
  return ephemeral;
}

export function setupAuth(app: Express) {
  const sessionSecret = resolveSessionSecret();
  const sessionCookieSecure = parseCookieSecureFlag(process.env);

  // ── Session store backed by PostgreSQL ──────────────────────────────────
  const PgStore = connectPgSimple(session);

  const sessionStore = new PgStore({
    pool: pool as any,
    createTableIfMissing: true,
  });
  (global as { __sessionStore?: InstanceType<typeof PgStore> }).__sessionStore = sessionStore;

  app.use(
    session({
      store: sessionStore,
      secret: sessionSecret,
      name: "axtask.sid",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        secure: sessionCookieSecure,
        sameSite: "lax",
      },
    })
  );

  // ── Passport local strategy ─────────────────────────────────────────────
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await getUserByEmail(email);
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }
          if (!user.passwordHash) {
            return done(null, false, { message: "Use your OAuth provider to sign in" });
          }
          const valid = await verifyPassword(password, user.passwordHash);
          if (!valid) {
            return done(null, false, { message: "Invalid email or password" });
          }
          const safe = await getUserById(user.id);
          return done(null, safe || false);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, (user as SafeUser).id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await getUserById(id);
      done(null, user || undefined);
    } catch (err) {
      done(err);
    }
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if ((req.user as any)?.isBanned) {
    req.logout(() => {});
    return res.status(403).json({ message: "This account has been suspended." });
  }
  next();
}

