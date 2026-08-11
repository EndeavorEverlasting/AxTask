import type { Express, Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import passport from "passport";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { registerSchema } from "@shared/schema";
import { toPublicSessionUser } from "@shared/public-client-dtos";
import { getRegistrationConfig, inviteConfiguredForClient } from "../registration-config";
import { getProvider, getAvailableProviders } from "../auth-providers";
import { verifyUserTotpFromCiphertext } from "../services/totp";
import { awardLoginRewards } from "../login-rewards";
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserRowById,
  recordFailedLogin,
  resetFailedLogins,
  createResetToken,
  consumeResetToken,
  setSecurityQuestion,
  getSecurityQuestion,
  verifySecurityAnswer,
  adminResetPassword,
  isUserBanned,
  logSecurityEvent,
  appendSecurityEvent,
} from "../storage";
import { evaluateAdherenceForUser } from "../services/adherence-evaluator";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts — try again in 15 minutes" },
});

const totpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authenticator attempts — try again shortly" },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts — try again in 1 hour" },
});

/** Constant-time string comparison — prevents timing side-channel leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const buf = Buffer.from(a, "utf8");
    timingSafeEqual(buf, buf);
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

// Invite-code / registration gate (normalized in server/registration-config.ts)
const registration = getRegistrationConfig();

function maskEmailForOtp(email: string): string {
  const [u, dom] = email.split("@");
  if (!u || !dom) return email;
  return `${u.slice(0, 2)}•••@${dom}`;
}

export function registerAuthRoutes(app: Express, requireAuth: RequireAuthMiddleware) {

  app.post("/api/auth/register", registerLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (registration.mode === "closed") {
        return res.status(403).json({ message: "Registration is currently closed" });
      }
      if (registration.mode === "invite") {
        const code = typeof req.body.inviteCode === "string" ? req.body.inviteCode.trim() : "";
        if (!registration.inviteCode) {
          console.warn("[auth] REGISTRATION_MODE=invite but INVITE_CODE is missing.");
          return res.status(403).json({ message: "Signup is temporarily unavailable. Please contact the AxTask owner for access." });
        }
        if (!safeEqual(code, registration.inviteCode)) {
          return res.status(403).json({ message: "Invalid invite code" });
        }
      }

      const { email, password, displayName } = registerSchema.parse(req.body);
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      const user = await createUser(email, password, displayName);
      void appendSecurityEvent({
        eventType: "auth_register_success",
        actorUserId: user.id,
        route: req.path,
        method: req.method,
        statusCode: 201,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      }).catch((auditError) => {
        console.warn(
          "[auth] registration audit append failed:",
          (auditError as Error)?.message || String(auditError),
        );
      });
      req.login(user, (err) => {
        if (err) return next(err);
        void awardLoginRewards(user.id);
        res.status(201).json(toPublicSessionUser(user));
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  });

  app.post("/api/auth/login", authLimiter, async (req: Request, res: Response, next) => {
    try {
      const { email } = req.body;
      if (email) {
        const banStatus = await isUserBanned(email);
        if (banStatus.banned) {
          await logSecurityEvent("login_banned_attempt", undefined, undefined, req.ip, `Banned user tried to login: ${email}`);
          return res.status(403).json({
            message: "This account has been suspended. Contact an administrator for assistance.",
          });
        }

        const dbUser = await getUserByEmail(email);
        if (dbUser?.lockedUntil && new Date(dbUser.lockedUntil) > new Date()) {
          const mins = Math.ceil((new Date(dbUser.lockedUntil).getTime() - Date.now()) / 60000);
          return res.status(423).json({
            message: `Account locked due to too many failed attempts. Try again in ${mins} minute(s).`,
          });
        }
      }

      passport.authenticate("local", async (err: any, user: any, info: any) => {
        if (err) return next(err);
        if (!user) {
          if (email) {
            await recordFailedLogin(email, req.ip);
            await logSecurityEvent("login_failed", undefined, undefined, req.ip, `Failed login for: ${email}`);
            await appendSecurityEvent({
              eventType: "auth_login_failed",
              route: req.path,
              method: req.method,
              statusCode: 401,
              ipAddress: req.ip,
              userAgent: req.get("user-agent") || undefined,
              payload: { email },
            });
          }
          return res.status(401).json({ message: info?.message || "Invalid credentials" });
        }
        await resetFailedLogins(user.email);
        const row = await getUserRowById(user.id);
        if (row?.totpEnabledAt && row.totpSecretCiphertext) {
          req.session.pendingTotpLogin = {
            userId: user.id,
            expiresAt: Date.now() + 5 * 60 * 1000,
          };
          await appendSecurityEvent({
            eventType: "auth_login_totp_pending",
            actorUserId: user.id,
            route: req.path,
            method: req.method,
            statusCode: 200,
            ipAddress: req.ip,
            userAgent: req.get("user-agent") || undefined,
          });
          return req.session.save((saveErr) => {
            if (saveErr) return next(saveErr);
            res.json({
              needsTotp: true,
              emailMask: maskEmailForOtp(user.email),
            });
          });
        }
        await logSecurityEvent("login_success", user.id, undefined, req.ip);
        await appendSecurityEvent({
          eventType: "auth_login_success",
          actorUserId: user.id,
          route: req.path,
          method: req.method,
          statusCode: 200,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        req.login(user, (err) => {
          if (err) return next(err);
          void awardLoginRewards(user.id);
          void evaluateAdherenceForUser(user.id, "login");
          res.json(toPublicSessionUser(user));
        });
      })(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const actorUserId = req.user?.id;
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      req.session.destroy((destroyErr) => {
        if (destroyErr) console.error("[auth] Session destroy error:", destroyErr);
        res.clearCookie("axtask.sid");
        void appendSecurityEvent({
          eventType: "auth_logout",
          actorUserId,
          route: req.path,
          method: req.method,
          statusCode: 200,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        res.json({ message: "Logged out" });
      });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    if ((req.user as any)?.isBanned) {
      req.logout(() => {});
      return res.status(403).json({ message: "This account has been suspended." });
    }
    const fresh = await getUserById(req.user!.id);
    if (!fresh) {
      req.logout(() => {});
      return res.status(401).json({ message: "Not authenticated" });
    }
    void evaluateAdherenceForUser(req.user!.id, "login");
    res.json(toPublicSessionUser(fresh));
  });

  app.get("/api/auth/config", (_req: Request, res: Response) => {
    const authProvider = getProvider();
    const providers = getAvailableProviders();
    const loginUrls: Record<string, string> = {
      workos: "/api/auth/workos/login",
      google: "/api/auth/google/login",
      replit: "/api/auth/replit/login",
      local: "",
    };
    res.json({
      registrationMode: registration.mode,
      inviteConfigured: inviteConfiguredForClient(registration),
      authProvider,
      loginUrl: loginUrls[authProvider] || "",
      providers,
    });
  });

  app.get("/api/auth/totp/pending", async (req: Request, res: Response) => {
    const p = req.session.pendingTotpLogin;
    if (!p || p.expiresAt < Date.now()) {
      delete req.session.pendingTotpLogin;
      return res.json({ pending: false });
    }
    const row = await getUserRowById(p.userId);
    const email = row?.email;
    res.json({
      pending: true,
      emailMask: email ? maskEmailForOtp(email) : undefined,
    });
  });

  app.post("/api/auth/totp/verify", totpVerifyLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = z.object({
        code: z.string().length(6).regex(/^\d{6}$/),
      }).parse(req.body);
      const pending = req.session.pendingTotpLogin;
      if (!pending || pending.expiresAt < Date.now()) {
        delete req.session.pendingTotpLogin;
        return res.status(401).json({ message: "Login session expired — sign in again" });
      }
      const row = await getUserRowById(pending.userId);
      if (!row?.totpSecretCiphertext || !row.totpEnabledAt) {
        delete req.session.pendingTotpLogin;
        return res.status(400).json({ message: "Authenticator is not enabled for this account" });
      }
      if (!verifyUserTotpFromCiphertext(row.totpSecretCiphertext, code)) {
        await appendSecurityEvent({
          eventType: "auth_totp_verify_failed",
          actorUserId: row.id,
          route: req.path,
          method: req.method,
          statusCode: 401,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.status(401).json({ message: "Invalid authenticator code" });
      }
      const safe = await getUserById(row.id);
      if (!safe) {
        delete req.session.pendingTotpLogin;
        return res.status(401).json({ message: "Account not found" });
      }
      delete req.session.pendingTotpLogin;
      req.login(safe, (err) => {
        if (err) return next(err);
        void awardLoginRewards(safe.id);
        void appendSecurityEvent({
          eventType: "auth_totp_login_success",
          actorUserId: safe.id,
          route: req.path,
          method: req.method,
          statusCode: 200,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        res.json(toPublicSessionUser(safe));
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      next(error);
    }
  });
  app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.json({ message: "If that email exists, a reset link has been sent.", method: "email" });
      }

      const result = await createResetToken(email, "email", 30);
      if (!result) {
        return res.json({ message: "If that email exists, a reset link has been sent.", method: "email" });
      }

      const resetUrl = `${req.protocol}://${req.get("host")}/?reset_token=${result.token}`;
      if (process.env.NODE_ENV !== "production") {
        console.log(`[PASSWORD RESET] (non-production) ${email}: ${resetUrl}`);
      }
      await logSecurityEvent("password_reset_requested", undefined, undefined, req.ip, `Reset requested for: ${email}`);

      const hasSecurityQuestion = !!user.securityQuestion;

      res.json({
        message: "If that email exists, a reset link has been sent.",
        method: "email",
        hasSecurityQuestion,
        ...(process.env.NODE_ENV === "development" ? { _devToken: result.token } : {}),
      });
    } catch (error) {
      res.status(500).json({ message: "Password reset request failed" });
    }
  });

  app.post("/api/auth/security-question", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const question = await getSecurityQuestion(email);
      if (!question) {
        return res.status(404).json({ message: "No security question set for this account" });
      }
      res.json({ question });
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve security question" });
    }
  });

  app.post("/api/auth/verify-security-answer", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email, answer } = req.body;
      if (!email || !answer) {
        return res.status(400).json({ message: "Email and answer are required" });
      }

      const valid = await verifySecurityAnswer(email, answer);
      if (!valid) {
        return res.status(401).json({ message: "Incorrect answer" });
      }

      const result = await createResetToken(email, "security_question", 15);
      if (!result) {
        return res.status(500).json({ message: "Failed to create reset token" });
      }

      res.json({ token: result.token, expiresAt: result.expiresAt });
    } catch (error) {
      res.status(500).json({ message: "Security verification failed" });
    }
  });

  app.post("/api/auth/reset-password", authLimiter, async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const success = await consumeResetToken(token, newPassword);
      if (!success) {
        await logSecurityEvent("password_reset_failed", undefined, undefined, req.ip, "Invalid or expired reset token");
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      await logSecurityEvent("password_reset_completed", undefined, undefined, req.ip);
      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      res.status(500).json({ message: "Password reset failed" });
    }
  });

  app.post("/api/auth/admin/reset-password", requireAuth, async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { targetEmail, newPassword } = req.body;
      if (!targetEmail || !newPassword) {
        return res.status(400).json({ message: "Target email and new password are required" });
      }

      const success = await adminResetPassword(targetEmail, newPassword);
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }

      await logSecurityEvent("admin_password_reset", req.user!.id, undefined, req.ip, `Admin reset password for: ${targetEmail}`);
      res.json({ message: `Password reset for ${targetEmail}` });
    } catch (error) {
      res.status(500).json({ message: "Admin password reset failed" });
    }
  });

  app.post("/api/auth/security-question/set", requireAuth, async (req: Request, res: Response) => {
    try {
      const { question, answer } = req.body;
      if (!question || !answer) {
        return res.status(400).json({ message: "Question and answer are required" });
      }
      if (answer.trim().length < 2) {
        return res.status(400).json({ message: "Answer must be at least 2 characters" });
      }

      await setSecurityQuestion(req.user!.id, question, answer);
      res.json({ message: "Security question updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to set security question" });
    }
  });

  app.get("/api/auth/security-question/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await getUserByEmail(req.user!.email);
      res.json({ hasSecurityQuestion: !!user?.securityQuestion, question: user?.securityQuestion || null });
    } catch (error) {
      res.status(500).json({ message: "Failed to check security question status" });
    }
  });
}
