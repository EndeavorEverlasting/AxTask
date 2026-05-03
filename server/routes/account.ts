import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { toPublicSessionUser } from "@shared/public-client-dtos";
import {
  buildTotpKeyUri,
  encryptTotpSecretBase32,
  generateTotpSecretBase32,
  verifyTotpCode,
} from "../services/totp";
import {
  getUserRowById,
  getUserById,
  appendSecurityEvent,
  updateUserAccountProfile,
  setUserTotpSecret,
  clearUserTotp,
  verifyPassword,
  verifyMfaChallenge,
  verifyMfaChallengeWithMetadata,
  setUserVerifiedPhone,
} from "../storage";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

function isIsoCalendarDateStrict(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, mo, d] = s.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return false;
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function registerAccountRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/account/profile", requireAuth, async (req, res) => {
    try {
      const row = await getUserRowById(req.user!.id);
      if (!row) return res.status(404).json({ message: "User not found" });
      res.json({
        displayName: row.displayName ?? null,
        birthDate: row.birthDate ?? null,
      });
    } catch {
      res.status(500).json({ message: "Failed to load profile" });
    }
  });

  app.patch("/api/account/profile", requireAuth, async (req, res) => {
    try {
      const body = z
        .object({
          displayName: z.union([z.string().max(120), z.null()]).optional(),
          birthDate: z.union([z.string(), z.null()]).optional(),
        })
        .refine((o) => o.displayName !== undefined || o.birthDate !== undefined, {
          message: "Provide at least one of displayName or birthDate",
        })
        .parse(req.body);

      const row = await getUserRowById(req.user!.id);
      if (!row) return res.status(404).json({ message: "User not found" });

      let birthDate: string | null | undefined;
      if (body.birthDate === undefined) {
        birthDate = undefined;
      } else if (body.birthDate === null || body.birthDate === "") {
        birthDate = null;
      } else if (typeof body.birthDate === "string" && isIsoCalendarDateStrict(body.birthDate)) {
        birthDate = body.birthDate;
      } else {
        return res.status(400).json({ message: "birthDate must be null or a valid YYYY-MM-DD calendar date" });
      }

      await updateUserAccountProfile(req.user!.id, {
        displayName: body.displayName !== undefined ? body.displayName : row.displayName ?? null,
        birthDate: birthDate !== undefined ? birthDate : row.birthDate ?? null,
      });
      const fresh = await getUserById(req.user!.id);
      if (!fresh) {
        return res.status(500).json({ message: "Account not found after update" });
      }
      await appendSecurityEvent({
        eventType: "account_profile_updated",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: {},
      });
      res.json({ message: "Profile updated", user: toPublicSessionUser(fresh) });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.get("/api/account/totp/status", requireAuth, async (req, res) => {
    try {
      const row = await getUserRowById(req.user!.id);
      const enr = req.session.totpEnrollment;
      const enrollmentPending = Boolean(
        enr && enr.userId === req.user!.id && enr.expiresAt > Date.now(),
      );
      res.json({
        totpEnabled: Boolean(row?.totpEnabledAt && row?.totpSecretCiphertext),
        enrollmentPending,
      });
    } catch {
      res.status(500).json({ message: "Failed to load authenticator status" });
    }
  });

  app.post("/api/account/totp/enrollment/start", requireAuth, async (req, res) => {
    try {
      const row = await getUserRowById(req.user!.id);
      if (!row) return res.status(404).json({ message: "User not found" });
      if (row.totpEnabledAt && row.totpSecretCiphertext) {
        return res.status(400).json({ message: "Authenticator is already enabled" });
      }
      const secretBase32 = generateTotpSecretBase32();
      req.session.totpEnrollment = {
        userId: req.user!.id,
        secretBase32,
        expiresAt: Date.now() + 10 * 60 * 1000,
      };
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
      const otpauthUrl = buildTotpKeyUri(row.email, secretBase32);
      res.json({ secretBase32, otpauthUrl });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to start enrollment" });
    }
  });

  app.post("/api/account/totp/enrollment/confirm", requireAuth, async (req, res) => {
    try {
      const { code } = z.object({
        code: z.string().length(6).regex(/^\d{6}$/),
      }).parse(req.body);
      const enr = req.session.totpEnrollment;
      if (!enr || enr.userId !== req.user!.id || enr.expiresAt < Date.now()) {
        delete req.session.totpEnrollment;
        return res.status(400).json({ message: "Enrollment expired — start again" });
      }
      if (!verifyTotpCode(enr.secretBase32, code)) {
        return res.status(401).json({ message: "Invalid code — check the clock on your device" });
      }
      const ciphertext = encryptTotpSecretBase32(enr.secretBase32);
      await setUserTotpSecret(req.user!.id, ciphertext, new Date());
      delete req.session.totpEnrollment;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
      const fresh = await getUserById(req.user!.id);
      if (!fresh) {
        return res.status(500).json({ message: "Account not found after enrollment" });
      }
      await appendSecurityEvent({
        eventType: "totp_enabled",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      res.json({ message: "Authenticator enabled", user: toPublicSessionUser(fresh) });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to confirm enrollment" });
    }
  });

  app.post("/api/account/totp/disable", requireAuth, async (req, res) => {
    try {
      const row = await getUserRowById(req.user!.id);
      if (!row?.totpEnabledAt || !row.totpSecretCiphertext) {
        return res.status(400).json({ message: "Authenticator is not enabled" });
      }

      const body = req.body as Record<string, unknown>;
      if (row.passwordHash) {
        const password = typeof body.password === "string" ? body.password : "";
        if (!password) {
          return res.status(400).json({ message: "Password is required to disable authenticator" });
        }
        const ok = await verifyPassword(password, row.passwordHash);
        if (!ok) {
          return res.status(403).json({ message: "Invalid password" });
        }
      } else {
        const parsed = z.object({
          challengeId: z.string().min(1),
          code: z.string().length(6).regex(/^\d{6}$/),
        }).parse(req.body);
        const ok = await verifyMfaChallenge(
          req.user!.id,
          parsed.challengeId,
          parsed.code,
          MFA_PURPOSES.ACCOUNT_DISABLE_TOTP,
        );
        if (!ok) {
          return res.status(403).json({ message: "Invalid or expired email verification code" });
        }
      }

      await clearUserTotp(req.user!.id);
      const fresh = await getUserById(req.user!.id);
      if (!fresh) {
        return res.status(500).json({ message: "Account not found after disabling authenticator" });
      }
      await appendSecurityEvent({
        eventType: "totp_disabled",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      res.json({ message: "Authenticator removed", user: toPublicSessionUser(fresh) });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to disable authenticator" });
    }
  });

  app.post("/api/account/phone/verify/confirm", requireAuth, async (req, res) => {
    try {
      const { challengeId, code } = z.object({
        challengeId: z.string().min(1),
        code: z.string().length(6).regex(/^\d{6}$/),
      }).parse(req.body);

      const result = await verifyMfaChallengeWithMetadata(
        req.user!.id,
        challengeId,
        code,
        MFA_PURPOSES.ACCOUNT_VERIFY_PHONE,
      );
      if (!result.ok || !result.smsDestinationE164?.trim()) {
        await appendSecurityEvent({
          eventType: "mfa_verify_failed",
          actorUserId: req.user!.id,
          route: req.path,
          method: req.method,
          statusCode: 403,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
          payload: { context: "account_verify_phone" },
        });
        return res.status(403).json({ message: "Invalid or expired verification code" });
      }

      await setUserVerifiedPhone(req.user!.id, result.smsDestinationE164);
      const fresh = await getUserById(req.user!.id);
      if (!fresh) {
        return res.status(500).json({ message: "Account not found after phone verification" });
      }
      await appendSecurityEvent({
        eventType: "phone_verified",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: {},
      });
      res.json({ message: "Phone verified", user: toPublicSessionUser(fresh) });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to verify phone" });
    }
  });
}
