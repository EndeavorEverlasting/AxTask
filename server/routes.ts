import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { timingSafeEqual, createHash } from "crypto";
import rateLimit from "express-rate-limit";
import passport from "passport";
import multer from "multer";
import { exportFullDatabase, exportUserData } from "./migration/export";
import { importBundle, importUserBundle, validateBundle, validateBundleWithDb } from "./migration/import";
import {
  storage, createUser, getUserByEmail, recordFailedLogin, resetFailedLogins,
  createResetToken, verifyResetToken, consumeResetToken,
  setSecurityQuestion, getSecurityQuestion, verifySecurityAnswer,
  adminResetPassword,
  banUser, unbanUser, getAllUsers, isUserBanned,
  logSecurityEvent, getSecurityLogs,
  getOrCreateWallet, getTransactions, getUserBadges, getRewardsCatalog, getUserRewards, redeemReward, seedRewardsCatalog,
  getOfflineGeneratorStatus, buyOfflineGenerator, upgradeOfflineGenerator, getOfflineSkillTree, unlockOfflineSkill, claimOfflineGeneratorCoins, seedOfflineSkillTree,
  assertCanCreateTasks, assertCanStoreAttachment, createAttachmentAsset, getAttachmentAssets, getAttachmentAssetById, markAttachmentAssetUploaded, softDeleteAttachmentAsset, retentionSweepAttachments, getStoragePolicy, getStorageUsage,
  hasImportFingerprint, recordImportFingerprint, createInvoice, issueInvoice, confirmInvoicePayment, listInvoices, listInvoiceEvents,
  createMfaChallenge, verifyMfaChallenge, verifyMfaChallengeWithMetadata, ensureIdempotencyKey,
  listBillingPaymentMethodsForUser, createBillingPaymentMethod,
  deleteMfaChallengeById, getUserContactForMfa, setUserVerifiedPhone, getUserById,
  appendSecurityEvent, getSecurityEvents, getSecurityAlerts, analyzeAndCreateSecurityAlerts,
  listFeedbackInbox,
  getFeedbackInsightsForUser,
  getFeedbackInsightsGlobal,
  PREMIUM_CATALOG,
  getPremiumEntitlements,
  listPremiumSubscriptions,
  upsertPremiumSubscription,
  downgradePremiumToGrace,
  reactivatePremium,
  listPremiumSavedViews,
  createPremiumSavedView,
  updatePremiumSavedView,
  deletePremiumSavedView,
  setDefaultPremiumSavedView,
  listPremiumReviewWorkflows,
  createPremiumReviewWorkflow,
  updatePremiumReviewWorkflow,
  deletePremiumReviewWorkflow,
  markPremiumReviewWorkflowRun,
  createPremiumInsight,
  listPremiumInsights,
  resolvePremiumInsight,
  buildWeeklyPremiumDigest,
  trackPremiumEvent,
  getPremiumRetentionMetrics,
  getUserNotificationPreference,
  upsertUserNotificationPreference,
  listUserPushSubscriptions,
  upsertUserPushSubscription,
  deleteUserPushSubscription,
  addCollaborator, removeCollaborator, getTaskCollaborators, updateCollaboratorRole,
  getSharedTasks, canAccessTask, isTaskOwner,
  resetStreak,
  getPatterns, getPatternsByType,
  getContributionsForTask, hasUserConfirmedTask, getUserClassificationStats, getContribution,
} from "./storage";
import {
  grantDeviceRefreshForUser,
  performAuthRefresh,
  revokeDeviceRefreshFromRequest,
  clearDeviceRefreshCookie,
} from "./device-refresh";
import { awardCoinsForCompletion, BADGE_DEFINITIONS } from "./coin-engine";
import { awardCoinsForClassification, awardCoinsForConfirmation } from "./classification-engine";
import { z } from "zod";
import { insertTaskSchema, updateTaskSchema, reorderTasksSchema, registerSchema, loginSchema, createPremiumSavedViewSchema, createPremiumReviewWorkflowSchema, updateNotificationPreferenceSchema, createPushSubscriptionSchema, deletePushSubscriptionSchema, type UpdateTask, type Task } from "@shared/schema";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { maskE164ForDisplay, normalizeToE164 } from "@shared/phone";
import { deliverMfaOtp, canDeliverMfaInProduction } from "./services/otp-delivery";
import { PriorityEngine } from "../client/src/lib/priority-engine";
import { dispatchVoiceCommand } from "./engines/dispatcher";
import { processPlannerQuery } from "./engines/planner-engine";
import { processFeedbackWithEngines } from "./engines/feedback-engine";
import { processTaskReview, type ReviewAction } from "./engines/review-engine";
import { analyzeTaskHistory, suggestDeadline, getInsights, learnFromTask } from "./engines/pattern-engine";
import { createGoogleSheetsAPI, type GoogleSheetsCredentials } from "./google-sheets-api";
import { generateChecklistPDF } from "./checklist-pdf";
import { processChecklistImage } from "./ocr-processor";
import { requireAuth } from "./auth";
import { getProvider, getAvailableProviders } from "./auth-providers";
import { captureUsageSnapshot, getUsageOverview, runRetentionDryRun } from "./services/usage-service";
import { createUploadToken, verifyUploadToken } from "./services/upload-token";
import { writeAttachmentObject, deleteAttachmentObject } from "./services/attachment-storage";
import { scanAttachmentBuffer } from "./services/attachment-scan";
import { classifyWithFallback } from "./services/classification/universal-classifier";
import { getNotificationDispatchProfile } from "./services/notification-intensity";

/** Constant-time string comparison — prevents timing side-channel leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against self to burn the same CPU time, then return false
    const buf = Buffer.from(a, "utf8");
    timingSafeEqual(buf, buf);
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function normalizeForFingerprint(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function computeTaskFingerprint(task: {
  date?: string;
  time?: string | null;
  activity?: string | null;
  notes?: string | null;
}): string {
  const base = [
    normalizeForFingerprint(task.date || ""),
    normalizeForFingerprint(task.time || ""),
    normalizeForFingerprint(task.activity || ""),
    normalizeForFingerprint(task.notes || ""),
  ].join("|");
  return createHash("sha256").update(base).digest("hex");
}

function getUploadSigningSecret(): string {
  return process.env.ATTACHMENT_UPLOAD_SECRET || process.env.SESSION_SECRET || "dev-upload-secret";
}

function buildAttachmentStorageKey(userId: string, assetId: string, fileName?: string): string {
  const safeName = (fileName || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
  const datePart = new Date().toISOString().slice(0, 10);
  return `${userId}/${datePart}/${assetId}-${safeName}`;
}

async function classifyTaskWithFallback(activity: string, notes: string, preferExternal = true): Promise<string> {
  const result = await classifyWithFallback(activity, notes, { preferExternal });
  return result.classification;
}

function hasFeature(entitlements: { features: string[] }, feature: string): boolean {
  return entitlements.features.includes(feature);
}

async function callNodeWeaverBatchClassify(items: Array<{ id: string; activity: string; notes?: string }>) {
  const baseUrl = process.env.NODEWEAVER_URL;
  if (!baseUrl) {
    throw new Error("NODEWEAVER_URL is not configured");
  }
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/classify/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tasks: items.map((item) => ({
        activity: item.activity,
        notes: item.notes || "",
        metadata: { classification_profile: "axtask" },
      })),
      metadata: { classification_profile: "axtask" },
    }),
  });
  if (!response.ok) {
    throw new Error(`NodeWeaver classify failed with status ${response.status}`);
  }
  return response.json();
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function toBand(value: number): "low" | "medium" | "high" {
  if (value >= 70) return "high";
  if (value >= 40) return "medium";
  return "low";
}

function buildAdminPretext(metrics: {
  completionRate: number;
  urgentFeedback: number;
  requestVolumeHour: number;
  completionDelta: number;
}): string[] {
  const lines: string[] = [];
  lines.push(
    metrics.requestVolumeHour > 120
      ? "Live traffic is elevated this hour. Watch incident and feedback queues closely."
      : "Traffic is stable right now. This is a good window for optimization work.",
  );
  lines.push(
    metrics.completionRate >= 60
      ? "Team execution is healthy; completion rate remains above the momentum baseline."
      : "Completion momentum dipped below target; nudge planners toward high-value backlog items.",
  );
  lines.push(
    metrics.urgentFeedback > 0
      ? `There are ${metrics.urgentFeedback} urgent feedback items. Route critical reports first.`
      : "No urgent feedback is currently detected by classification agents.",
  );
  lines.push(
    metrics.completionDelta >= 0
      ? "Completion trend is improving versus last week."
      : "Completion trend is down week-over-week; investigate blockers and repeated task load.",
  );
  return lines;
}

function buildAdminSignals(metrics: {
  completionRate: number;
  completionDelta: number;
  requestVolumeHour: number;
  urgentFeedback: number;
  feedbackProcessed: number;
}) {
  const urgentRatio = metrics.feedbackProcessed > 0
    ? Number(((metrics.urgentFeedback / metrics.feedbackProcessed) * 100).toFixed(1))
    : 0;

  return [
    {
      key: "completion_delta",
      label: "Completion delta (WoW)",
      value: metrics.completionDelta,
      unit: "tasks",
      tone: metrics.completionDelta >= 0 ? "positive" : "warning",
    },
    {
      key: "request_volume_hour",
      label: "Current request volume",
      value: metrics.requestVolumeHour,
      unit: "req/h",
      tone: metrics.requestVolumeHour > 120 ? "warning" : "neutral",
    },
    {
      key: "urgent_feedback_ratio",
      label: "Urgent feedback ratio",
      value: urgentRatio,
      unit: "%",
      tone: urgentRatio >= 25 ? "warning" : "neutral",
    },
    {
      key: "completion_rate",
      label: "Completion rate",
      value: metrics.completionRate,
      unit: "%",
      tone: metrics.completionRate >= 60 ? "positive" : "warning",
    },
  ];
}

async function populateAnalyticsGraphParametersWithAgent(tasks: Task[]) {
  const completed = tasks.filter((t) => t.status === "completed");
  const pending = tasks.filter((t) => t.status !== "completed");

  const today = new Date();
  const trailing14 = Array.from({ length: 14 }, (_, idx) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (13 - idx));
    const day = toIsoDate(d);
    const completedCount = completed.filter((t) => toIsoDate(new Date(t.updatedAt || t.createdAt || new Date())) === day).length;
    return { day, completed: completedCount };
  });

  const activeDays = trailing14.filter((d) => d.completed > 0).length;
  const weeklyCompletions = trailing14.slice(-7).reduce((sum, d) => sum + d.completed, 0);
  const highValueCompleted = completed.filter((t) => t.priority === "Highest" || t.priority === "High").length;
  const repeatCompleted = completed.filter((t) => Boolean(t.isRepeated)).length;
  const uniqueClasses = new Set(completed.map((t) => (t.classification || "General").trim()).filter(Boolean)).size;
  const overdueBacklog = pending.filter((t) => t.date < toIsoDate(today)).length;

  const values = [
    {
      key: "completionMomentum",
      label: "Completion Momentum",
      value: clampPercent((weeklyCompletions / 14) * 100),
      rationale: "Agent weights recent completions to reflect execution momentum.",
    },
    {
      key: "focusOnHighValue",
      label: "High-Value Focus",
      value: completed.length > 0 ? clampPercent((highValueCompleted / completed.length) * 100) : 0,
      rationale: "Agent tracks how many completed tasks are High/Highest priority.",
    },
    {
      key: "categoryCoverage",
      label: "Category Coverage",
      value: clampPercent((uniqueClasses / 8) * 100),
      rationale: "Agent evaluates diversity of completed task classifications.",
    },
    {
      key: "consistency",
      label: "Consistency",
      value: clampPercent((activeDays / 14) * 100),
      rationale: "Agent scores consistency by days with at least one completed task.",
    },
    {
      key: "repeatTaskControl",
      label: "Repeat Task Control",
      value: completed.length > 0 ? clampPercent((repeatCompleted / completed.length) * 100) : 0,
      rationale: "Agent identifies operational load from repeated completed work.",
    },
    {
      key: "backlogRelief",
      label: "Backlog Relief",
      value: tasks.length > 0 ? clampPercent((completed.length / tasks.length) * 100) : 0,
      rationale: overdueBacklog > 0
        ? "Agent lowers confidence while overdue backlog remains."
        : "Agent confirms healthy completion ratio against current backlog.",
    },
  ];

  return values.map((item) => ({
    ...item,
    band: toBand(item.value),
  }));
}

// ── Rate limiters ───────────────────────────────────────────────────────────
// Strict limiter for auth endpoints — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts — try again in 15 minutes" },
  // use default keyGenerator (handles IPv6 correctly)
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts — try again in 1 hour" },
});

function userOrIpKey(req: Request): string {
  if (req.user?.id) return `user:${req.user.id}`;
  const forwarded = req.headers["x-forwarded-for"];
  const addr = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket?.remoteAddress;
  return addr || "unknown";
}

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many requests — slow down" },
});

const voiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many voice requests — try again shortly" },
});

const migrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many migration requests — try again later" },
});


// ── Invite-code / registration gate ─────────────────────────────────────────
// In production, set REGISTRATION_MODE=invite in .env and provide INVITE_CODE.
// Allowed values: "open" (anyone), "invite" (requires code), "closed" (no signups).
const REGISTRATION_MODE = process.env.REGISTRATION_MODE || (process.env.NODE_ENV === "production" ? "invite" : "open");
const INVITE_CODE = process.env.INVITE_CODE || "";

function maskEmailForOtp(email: string): string {
  const [u, dom] = email.split("@");
  if (!u || !dom) return email;
  return `${u.slice(0, 2)}•••@${dom}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/api", (req, res, next) => {
    const startedAt = Date.now();
    const actorUserId = req.user?.id;
    const ipAddress = req.ip;
    const userAgent = req.get("user-agent") || undefined;
    res.on("finish", async () => {
      try {
        await appendSecurityEvent({
          eventType: "api_request",
          actorUserId,
          route: req.path,
          method: req.method,
          statusCode: res.statusCode,
          ipAddress,
          userAgent,
          payload: {
            durationMs: Date.now() - startedAt,
          },
        });
      } catch {
        // Avoid breaking request lifecycle because of audit sink failures.
      }
    });
    next();
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Auth routes (public, rate-limited)
  // ════════════════════════════════════════════════════════════════════════

  app.post("/api/auth/register", registerLimiter, async (req: Request, res: Response) => {
    try {
      // ── Registration gate ──────────────────────────────────────────────
      if (REGISTRATION_MODE === "closed") {
        return res.status(403).json({ message: "Registration is currently closed" });
      }
      if (REGISTRATION_MODE === "invite") {
        const code = typeof req.body.inviteCode === "string" ? req.body.inviteCode : "";
        if (!INVITE_CODE) {
          return res.status(403).json({ message: "Registration requires an invite code, but none is configured on the server" });
        }
        if (!safeEqual(code, INVITE_CODE)) {
          return res.status(403).json({ message: "Invalid invite code" });
        }
      }

      const { email, password, displayName } = registerSchema.parse(req.body);
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      const user = await createUser(email, password, displayName);
      await appendSecurityEvent({
        eventType: "auth_register_success",
        actorUserId: user.id,
        route: req.path,
        method: req.method,
        statusCode: 201,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      // Auto-login after registration
      req.login(user, async (err) => {
        if (err) return res.status(500).json({ message: "Registration succeeded but login failed" });
        try {
          await grantDeviceRefreshForUser(req, res, user.id);
        } catch (e) {
          console.error("[auth] device token after register:", e);
        }
        res.status(201).json(user);
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Registration failed" });
      }
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
        req.login(user, async (err) => {
          if (err) return next(err);
          try {
            await grantDeviceRefreshForUser(req, res, user.id);
          } catch (e) {
            console.error("[auth] device token after login:", e);
          }
          res.json(user);
        });
      })(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/refresh", authLimiter, async (req: Request, res: Response) => {
    await performAuthRefresh(req, res);
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const actorUserId = req.user?.id;
    try {
      await revokeDeviceRefreshFromRequest(req);
    } catch (e) {
      console.error("[auth] revoke device refresh:", e);
    }
    clearDeviceRefreshCookie(res);
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      // Destroy the session entirely so back-button can't restore it
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
    res.json(fresh);
  });

  // Return registration mode + auth provider so the UI can adapt
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
      registrationMode: REGISTRATION_MODE,
      authProvider,
      loginUrl: loginUrls[authProvider] || "",
      providers,
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Password Reset routes (public, rate-limited)
  // ════════════════════════════════════════════════════════════════════════

  // Tier 1: Request email-based password reset
  app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const user = await getUserByEmail(email);
      // Always return success to prevent email enumeration
      if (!user || !user.passwordHash) {
        return res.json({ message: "If that email exists, a reset link has been sent.", method: "email" });
      }

      const result = await createResetToken(email, "email", 30);
      if (!result) {
        return res.json({ message: "If that email exists, a reset link has been sent.", method: "email" });
      }

      const resetUrl = `${req.protocol}://${req.get("host")}/?reset_token=${result.token}`;
      console.log(`[PASSWORD RESET] Token for ${email}: ${resetUrl}`);
      await logSecurityEvent("password_reset_requested", undefined, undefined, req.ip, `Reset requested for: ${email}`);

      // Check if security question is available as fallback
      const hasSecurityQuestion = !!user.securityQuestion;

      res.json({
        message: "If that email exists, a reset link has been sent.",
        method: "email",
        hasSecurityQuestion,
        // In dev, also return the token so the UI can use it directly
        ...(process.env.NODE_ENV === "development" ? { _devToken: result.token } : {}),
      });
    } catch (error) {
      res.status(500).json({ message: "Password reset request failed" });
    }
  });

  // Tier 2: Get security question for an email
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

  // Tier 2: Verify security answer → get reset token
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

      // Issue a reset token via security_question method
      const result = await createResetToken(email, "security_question", 15);
      if (!result) {
        return res.status(500).json({ message: "Failed to create reset token" });
      }

      res.json({ token: result.token, expiresAt: result.expiresAt });
    } catch (error) {
      res.status(500).json({ message: "Security verification failed" });
    }
  });

  // Final step: Reset password using a valid token
  app.post("/api/auth/reset-password", authLimiter, async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      // Validate password strength
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

  // Tier 3: Admin reset — requires authenticated admin
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

  // Set/update security question (requires login)
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

  // Check if current user has a security question set
  app.get("/api/auth/security-question/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await getUserByEmail(req.user!.email);
      res.json({ hasSecurityQuestion: !!user?.securityQuestion, question: user?.securityQuestion || null });
    } catch (error) {
      res.status(500).json({ message: "Failed to check security question status" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Premium routes (protected)
  // ════════════════════════════════════════════════════════════════════════
  const premiumApiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userOrIpKey,
    message: { message: "Too many premium requests — slow down" },
  });
  app.use("/api/premium", premiumApiLimiter);
  const premiumFeatureFlags: Record<string, boolean> = {
    saved_smart_views: process.env.PREMIUM_FLAG_SAVED_VIEWS !== "false",
    review_workflows: process.env.PREMIUM_FLAG_REVIEW_WORKFLOWS !== "false",
    weekly_digest: process.env.PREMIUM_FLAG_WEEKLY_DIGEST !== "false",
    classification_history_replay: process.env.PREMIUM_FLAG_CLASSIFICATION_REPLAY !== "false",
    confidence_drift_alerts: process.env.PREMIUM_FLAG_CONFIDENCE_DRIFT !== "false",
    bundle_auto_reprioritize: process.env.PREMIUM_FLAG_BUNDLE_AUTOMATION !== "false",
    cross_product_digest: process.env.PREMIUM_FLAG_CROSS_PRODUCT_DIGEST !== "false",
  };

  async function requirePremiumFeature(
    req: Request,
    res: Response,
    next: () => any,
    feature: string,
    writeOperation = false,
  ) {
    try {
      const entitlements = await getPremiumEntitlements(req.user!.id);
      if (premiumFeatureFlags[feature] === false) {
        return res.status(503).json({
          message: "Premium feature is currently disabled by feature flag",
          feature,
        });
      }
      if (!hasFeature(entitlements, feature)) {
        return res.status(402).json({
          message: "Premium feature required",
          requiredFeature: feature,
          entitlements,
        });
      }
      if (writeOperation && entitlements.inGracePeriod) {
        return res.status(409).json({
          message: "Premium plan is in grace mode. This feature is read-only until reactivated.",
          graceUntil: entitlements.graceUntil,
        });
      }
      (req as any).premiumEntitlements = entitlements;
      return next();
    } catch (error) {
      return res.status(500).json({ message: "Failed to resolve premium entitlements" });
    }
  }

  app.get("/api/premium/catalog", requireAuth, async (_req, res) => {
    res.json(PREMIUM_CATALOG);
  });

  app.get("/api/premium/entitlements", requireAuth, async (req, res) => {
    try {
      const [entitlements, subscriptions] = await Promise.all([
        getPremiumEntitlements(req.user!.id),
        listPremiumSubscriptions(req.user!.id),
      ]);
      res.json({ entitlements, subscriptions });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch premium entitlements" });
    }
  });

  app.post("/api/premium/subscriptions/activate", requireAuth, async (req, res) => {
    try {
      const payload = z.object({
        product: z.enum(["axtask", "nodeweaver", "bundle"]),
        planKey: z.string().min(3).max(120),
      }).parse(req.body || {});
      const subscription = await upsertPremiumSubscription({
        userId: req.user!.id,
        product: payload.product,
        planKey: payload.planKey,
        status: "active",
      });
      await trackPremiumEvent({
        userId: req.user!.id,
        eventName: "premium_subscription_activated",
        product: payload.product,
        planKey: payload.planKey,
      });
      res.status(201).json(subscription);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to activate premium subscription" });
    }
  });

  app.post("/api/premium/subscriptions/downgrade", requireAuth, async (req, res) => {
    try {
      const payload = z.object({
        product: z.enum(["axtask", "nodeweaver", "bundle"]),
        graceDays: z.number().int().min(1).max(30).default(14),
      }).parse(req.body || {});
      const updated = await downgradePremiumToGrace(req.user!.id, payload.product, payload.graceDays);
      if (!updated) return res.status(404).json({ message: "No active subscription found for this product" });
      res.json(updated);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to start grace mode" });
    }
  });

  app.post("/api/premium/subscriptions/reactivate", requireAuth, async (req, res) => {
    try {
      const payload = z.object({
        product: z.enum(["axtask", "nodeweaver", "bundle"]),
      }).parse(req.body || {});
      const updated = await reactivatePremium(req.user!.id, payload.product);
      if (!updated) return res.status(404).json({ message: "Subscription not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to reactivate subscription" });
    }
  });

  app.get("/api/premium/saved-views", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const views = await listPremiumSavedViews(req.user!.id);
      res.json(views);
    }, "saved_smart_views", true);
  });

  app.post("/api/premium/saved-views", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const payload = createPremiumSavedViewSchema.parse(req.body || {});
      const view = await createPremiumSavedView({
        userId: req.user!.id,
        name: payload.name,
        filtersJson: payload.filtersJson,
        autoRefreshMinutes: payload.autoRefreshMinutes,
      });
      res.status(201).json(view);
    }, "saved_smart_views", true);
  });

  app.put("/api/premium/saved-views/:id", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const payload = z.object({
        name: z.string().min(2).max(120).optional(),
        filtersJson: z.string().min(2).max(4000).optional(),
        autoRefreshMinutes: z.number().int().min(1).max(1440).optional(),
        lastOpenedAt: z.string().datetime().optional(),
      }).parse(req.body || {});
      const view = await updatePremiumSavedView({
        userId: req.user!.id,
        id: req.params.id,
        name: payload.name,
        filtersJson: payload.filtersJson,
        autoRefreshMinutes: payload.autoRefreshMinutes,
        lastOpenedAt: payload.lastOpenedAt ? new Date(payload.lastOpenedAt) : undefined,
      });
      if (!view) return res.status(404).json({ message: "Saved view not found" });
      res.json(view);
    }, "saved_smart_views", true);
  });

  app.delete("/api/premium/saved-views/:id", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const deleted = await deletePremiumSavedView(req.user!.id, req.params.id);
      if (!deleted) return res.status(404).json({ message: "Saved view not found" });
      res.status(204).send();
    }, "saved_smart_views", true);
  });

  app.post("/api/premium/saved-views/:id/default", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      await setDefaultPremiumSavedView(req.user!.id, req.params.id);
      res.json({ message: "Default saved view updated" });
    }, "saved_smart_views");
  });

  app.get("/api/premium/review-workflows", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const workflows = await listPremiumReviewWorkflows(req.user!.id);
      res.json(workflows);
    }, "review_workflows", true);
  });

  app.post("/api/premium/review-workflows", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const payload = createPremiumReviewWorkflowSchema.parse(req.body || {});
      const workflow = await createPremiumReviewWorkflow({
        userId: req.user!.id,
        name: payload.name,
        cadence: payload.cadence as "daily" | "weekly" | "monthly",
        criteriaJson: payload.criteriaJson,
        templateJson: payload.templateJson,
        isActive: payload.isActive,
      });
      res.status(201).json(workflow);
    }, "review_workflows", true);
  });

  app.put("/api/premium/review-workflows/:id", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const payload = z.object({
        name: z.string().min(2).max(120).optional(),
        cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
        criteriaJson: z.string().min(2).max(4000).optional(),
        templateJson: z.string().min(2).max(4000).optional(),
        isActive: z.boolean().optional(),
      }).parse(req.body || {});
      const workflow = await updatePremiumReviewWorkflow({
        userId: req.user!.id,
        id: req.params.id,
        name: payload.name,
        cadence: payload.cadence,
        criteriaJson: payload.criteriaJson,
        templateJson: payload.templateJson,
        isActive: payload.isActive,
      });
      if (!workflow) return res.status(404).json({ message: "Workflow not found" });
      res.json(workflow);
    }, "review_workflows", true);
  });

  app.delete("/api/premium/review-workflows/:id", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const deleted = await deletePremiumReviewWorkflow(req.user!.id, req.params.id);
      if (!deleted) return res.status(404).json({ message: "Workflow not found" });
      res.status(204).send();
    }, "review_workflows", true);
  });

  app.post("/api/premium/review-workflows/:id/run", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const workflow = await markPremiumReviewWorkflowRun(req.user!.id, req.params.id);
      if (!workflow) return res.status(404).json({ message: "Workflow not found" });
      const allTasks = await storage.getTasks(req.user!.id);
      const pending = allTasks.filter((task) => task.status !== "completed");
      const overdue = pending.filter((task) => task.date < new Date().toISOString().slice(0, 10));
      const highest = pending.filter((task) => task.priority === "Highest" || task.priority === "High");
      res.json({
        workflow,
        summary: {
          pending: pending.length,
          overdue: overdue.length,
          highPriorityOpen: highest.length,
        },
      });
    }, "review_workflows");
  });

  app.get("/api/premium/insights", requireAuth, async (req, res) => {
    try {
      const status = req.query.status === "resolved" ? "resolved" : req.query.status === "open" ? "open" : undefined;
      const insights = await listPremiumInsights(req.user!.id, status);
      res.json(insights);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch premium insights" });
    }
  });

  app.post("/api/premium/insights", requireAuth, async (req, res) => {
    try {
      const payload = z.object({
        source: z.enum(["axtask", "nodeweaver", "bundle"]),
        insightType: z.string().min(2).max(120),
        title: z.string().min(2).max(200),
        body: z.string().min(2).max(5000),
        severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        metadata: z.record(z.unknown()).optional(),
      }).parse(req.body || {});
      const insight = await createPremiumInsight({
        userId: req.user!.id,
        source: payload.source,
        insightType: payload.insightType,
        title: payload.title,
        body: payload.body,
        severity: payload.severity,
        metadata: payload.metadata,
      });
      res.status(201).json(insight);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to create premium insight" });
    }
  });

  app.post("/api/premium/insights/:id/resolve", requireAuth, async (req, res) => {
    try {
      const insight = await resolvePremiumInsight(req.user!.id, req.params.id);
      if (!insight) return res.status(404).json({ message: "Insight not found" });
      res.json(insight);
    } catch (error) {
      res.status(500).json({ message: "Failed to resolve insight" });
    }
  });

  app.get("/api/premium/reactivation-prompts", requireAuth, async (req, res) => {
    try {
      const [entitlements, openInsights] = await Promise.all([
        getPremiumEntitlements(req.user!.id),
        listPremiumInsights(req.user!.id, "open"),
      ]);
      if (!entitlements.inGracePeriod) {
        return res.json({ inGracePeriod: false, prompts: [] });
      }
      const prompts = [
        openInsights.length > 0 ? `You still have ${openInsights.length} unresolved premium insights.` : null,
        entitlements.graceUntil ? `Grace access ends on ${new Date(entitlements.graceUntil).toISOString().slice(0, 10)}.` : null,
        "Reactivate now to keep write access to premium workflows and automations.",
      ].filter(Boolean);
      res.json({
        inGracePeriod: true,
        graceUntil: entitlements.graceUntil,
        prompts,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to build reactivation prompts" });
    }
  });

  app.post("/api/premium/digests/weekly", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const digest = await buildWeeklyPremiumDigest(req.user!.id);
      await trackPremiumEvent({
        userId: req.user!.id,
        eventName: "premium_weekly_digest_generated",
        product: "axtask",
        metadata: { generatedAt: digest.generatedAt },
      });
      res.json(digest);
    }, "weekly_digest");
  });

  app.post("/api/premium/bundle/reclassify-backlog", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const allTasks = await storage.getTasks(req.user!.id);
      const pending = allTasks.filter((task) => task.status !== "completed").slice(0, 100);
      if (pending.length === 0) {
        return res.json({ message: "No pending tasks to reclassify", updated: 0 });
      }
      const batchResponse = await callNodeWeaverBatchClassify(
        pending.map((task) => ({ id: task.id, activity: task.activity, notes: task.notes || "" })),
      );
      const results = Array.isArray(batchResponse?.results) ? batchResponse.results : [];
      const updates: UpdateTask[] = [];
      for (let i = 0; i < pending.length; i++) {
        const result = results[i];
        const category = typeof result?.predicted_category === "string" ? result.predicted_category : undefined;
        const confidence = typeof result?.confidence_score === "number" ? result.confidence_score : undefined;
        if (!category) continue;
        updates.push({
          id: pending[i].id,
          classification: category,
          priority: confidence !== undefined && confidence < 0.45 ? "High" : pending[i].priority,
          priorityScore: confidence !== undefined && confidence < 0.45
            ? Math.max(pending[i].priorityScore || 0, 70)
            : pending[i].priorityScore || 0,
        });
        if (confidence !== undefined && confidence < 0.45) {
          await createPremiumInsight({
            userId: req.user!.id,
            source: "bundle",
            insightType: "confidence_drift",
            title: "Low confidence classification detected",
            body: `Task "${pending[i].activity}" dropped below confidence threshold (${confidence.toFixed(2)}).`,
            severity: "high",
            metadata: { taskId: pending[i].id, confidence },
          });
        }
      }
      await storage.bulkUpdateTasks(req.user!.id, updates);
      await trackPremiumEvent({
        userId: req.user!.id,
        eventName: "bundle_backlog_reclassified",
        product: "bundle",
        planKey: "power_bundle_monthly",
        metadata: { scanned: pending.length, updated: updates.length },
      });
      res.json({ scanned: pending.length, updated: updates.length });
    }, "bundle_auto_reprioritize", true);
  });

  app.post("/api/premium/bundle/auto-reprioritize", requireAuth, async (req, res) => {
    await requirePremiumFeature(req, res, async () => {
      const body = z.object({
        lowConfidenceThreshold: z.number().min(0.1).max(0.9).default(0.45),
      }).parse(req.body || {});
      const allTasks = await storage.getTasks(req.user!.id);
      const pending = allTasks.filter((task) => task.status !== "completed").slice(0, 100);
      const batchResponse = await callNodeWeaverBatchClassify(
        pending.map((task) => ({ id: task.id, activity: task.activity, notes: task.notes || "" })),
      );
      const results = Array.isArray(batchResponse?.results) ? batchResponse.results : [];
      const updates: UpdateTask[] = [];

      for (let i = 0; i < pending.length; i++) {
        const confidence = Number(results[i]?.confidence_score);
        if (!Number.isFinite(confidence) || confidence >= body.lowConfidenceThreshold) continue;
        updates.push({
          id: pending[i].id,
          priority: "High",
          priorityScore: Math.max(pending[i].priorityScore || 0, 75),
        });
      }
      await storage.bulkUpdateTasks(req.user!.id, updates);
      await trackPremiumEvent({
        userId: req.user!.id,
        eventName: "bundle_auto_reprioritize_run",
        product: "bundle",
        metadata: {
          scanned: pending.length,
          reprioritized: updates.length,
          threshold: body.lowConfidenceThreshold,
        },
      });
      res.json({
        scanned: pending.length,
        reprioritized: updates.length,
        threshold: body.lowConfidenceThreshold,
      });
    }, "bundle_auto_reprioritize", true);
  });

  app.get("/api/notifications/preferences", requireAuth, async (req, res) => {
    try {
      const preference = await getUserNotificationPreference(req.user!.id);
      res.json({
        ...preference,
        dispatchProfile: getNotificationDispatchProfile(preference.intensity),
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch notification preferences" });
    }
  });

  app.patch("/api/notifications/preferences", requireAuth, async (req, res) => {
    try {
      const payload = updateNotificationPreferenceSchema.parse(req.body || {});
      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ message: "At least one preference field is required" });
      }

      const preference = await upsertUserNotificationPreference({
        userId: req.user!.id,
        enabled: payload.enabled,
        intensity: payload.intensity,
        quietHoursStart: payload.quietHoursStart,
        quietHoursEnd: payload.quietHoursEnd,
      });
      return res.json({
        ...preference,
        dispatchProfile: getNotificationDispatchProfile(preference.intensity),
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      return res.status(500).json({ message: "Failed to update notification preferences" });
    }
  });

  app.get("/api/notifications/subscriptions", requireAuth, async (req, res) => {
    try {
      const subscriptions = await listUserPushSubscriptions(req.user!.id);
      res.json(subscriptions);
    } catch {
      res.status(500).json({ message: "Failed to fetch push subscriptions" });
    }
  });

  app.post("/api/notifications/subscriptions", requireAuth, async (req, res) => {
    try {
      const payload = createPushSubscriptionSchema.parse(req.body || {});
      const subscription = await upsertUserPushSubscription({
        userId: req.user!.id,
        endpoint: payload.endpoint,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
        expirationTime: payload.expirationTime,
        userAgent: payload.userAgent || req.get("user-agent") || undefined,
      });
      res.status(201).json(subscription);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to save push subscription" });
    }
  });

  app.delete("/api/notifications/subscriptions", requireAuth, async (req, res) => {
    try {
      const payload = deletePushSubscriptionSchema.parse(req.body || {});
      const deleted = await deleteUserPushSubscription(req.user!.id, payload.endpoint);
      if (!deleted) return res.status(404).json({ message: "Push subscription not found" });
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to remove push subscription" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Task routes (protected — require login)
  // ════════════════════════════════════════════════════════════════════════

  app.use("/api/tasks", apiLimiter);

  app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.getTasks(req.user!.id);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  // Get task stats (must come before :id route)
  app.get("/api/tasks/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getTaskStats(req.user!.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task stats" });
    }
  });

  app.get("/api/analytics/overview", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);

      const byPriority = allTasks.reduce((acc, task) => {
        acc[task.priority] = (acc[task.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const byClassification = allTasks.reduce((acc, task) => {
        acc[task.classification] = (acc[task.classification] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const byStatus = allTasks.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const today = new Date();
      const completionTrend = Array.from({ length: 14 }, (_, idx) => {
        const day = new Date(today);
        day.setDate(today.getDate() - (13 - idx));
        const key = toIsoDate(day);
        const completed = allTasks.filter(
          (t) => t.status === "completed" && toIsoDate(new Date(t.updatedAt || t.createdAt || new Date())) === key,
        ).length;
        return { date: key, completed };
      });

      const graphParameters = await populateAnalyticsGraphParametersWithAgent(allTasks);
      const feedbackInsights = await getFeedbackInsightsForUser(userId, 500);
      const completionCount = byStatus.completed || 0;

      res.json({
        taskMetrics: {
          total: allTasks.length,
          completionCount,
          completionRate: allTasks.length > 0 ? Math.round((completionCount / allTasks.length) * 100) : 0,
          byPriority,
          byClassification,
          byStatus,
        },
        completionTrend,
        graphParameters,
        feedbackInsights,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics overview" });
    }
  });

  app.get("/api/storage/me", requireAuth, async (req, res) => {
    try {
      const [policy, usage] = await Promise.all([
        getStoragePolicy(req.user!.id),
        getStorageUsage(req.user!.id),
      ]);
      res.json({ policy, usage });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch storage profile" });
    }
  });

  // Search tasks
  app.get("/api/tasks/search/:query", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.searchTasks(req.user!.id, req.params.query);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to search tasks" });
    }
  });

  // Get tasks by status
  app.get("/api/tasks/status/:status", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.getTasksByStatus(req.user!.id, req.params.status);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks by status" });
    }
  });

  // Get tasks by priority
  app.get("/api/tasks/priority/:priority", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.getTasksByPriority(req.user!.id, req.params.priority);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks by priority" });
    }
  });

  // Get task by ID
  app.get("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const task = await storage.getTask(req.user!.id, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  // Bulk import tasks (must be before /api/tasks POST)
  app.post("/api/tasks/import", requireAuth, async (req, res) => {
    try {
      const { tasks: taskList } = req.body;
      if (!Array.isArray(taskList) || taskList.length === 0) {
        return res.status(400).json({ message: "No tasks provided" });
      }

      if (taskList.length > 50000) {
        return res.status(400).json({ message: "Maximum 50,000 tasks per import" });
      }

      const userId = req.user!.id;
      const quota = await assertCanCreateTasks(userId, taskList.length);
      if (!quota.ok) {
        return res.status(413).json({ message: quota.message });
      }

      const validTasks: any[] = [];
      const errors: { index: number; error: string }[] = [];
      const skippedDuplicates: { index: number; reason: string }[] = [];

      for (let i = 0; i < taskList.length; i++) {
        try {
          const validated = insertTaskSchema.parse(taskList[i]);
          const fingerprint = computeTaskFingerprint(validated);
          const seen = await hasImportFingerprint(userId, fingerprint);
          if (seen) {
            skippedDuplicates.push({ index: i, reason: "Duplicate task fingerprint" });
            continue;
          }
          validTasks.push({ ...validated, __fingerprint: fingerprint });
        } catch (err: any) {
          errors.push({ index: i, error: err.message || "Validation failed" });
        }
      }

      let inserted: any[] = [];
      if (validTasks.length > 0) {
        inserted = await storage.createTasksBulk(userId, validTasks.map(({ __fingerprint, ...task }) => task));
        for (let i = 0; i < inserted.length; i++) {
          const fingerprint = validTasks[i]?.__fingerprint;
          if (fingerprint) {
            await recordImportFingerprint(userId, fingerprint, "bulk_import", inserted[i]?.id);
          }
        }

        const existingTasks = await storage.getTasks(userId);

        const UPDATE_BATCH = 500;
        for (let i = 0; i < inserted.length; i += UPDATE_BATCH) {
          const batch = inserted.slice(i, i + UPDATE_BATCH);
          const updates: UpdateTask[] = [];

          for (const task of batch) {
            try {
              const contextTasks = existingTasks.filter(t => t.id !== task.id);
              const priorityResult = await PriorityEngine.calculatePriority(
                task.activity, task.notes || "", task.urgency, task.impact, task.effort,
                contextTasks
              );
              const classification = await classifyTaskWithFallback(task.activity, task.notes || "", false);
              updates.push({
                id: task.id,
                priority: priorityResult.priority,
                priorityScore: Math.round(priorityResult.score * 10),
                classification,
                isRepeated: priorityResult.isRepeated,
              });
            } catch (e) {
              const classification = await classifyTaskWithFallback(task.activity, task.notes || "", false);
              updates.push({
                id: task.id,
                priority: "Low",
                priorityScore: 0,
                classification,
                isRepeated: false,
              });
            }
          }

          await storage.bulkUpdateTasks(userId, updates);
        }
      }

      res.status(201).json({
        imported: inserted.length,
        skippedAsDuplicate: skippedDuplicates.length,
        failed: errors.length,
        total: taskList.length,
        errors: errors.slice(0, 50),
        skipped: skippedDuplicates.slice(0, 50),
      });
      await appendSecurityEvent({
        eventType: "import_batch_processed",
        actorUserId: userId,
        route: req.path,
        method: req.method,
        statusCode: 201,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: {
          imported: inserted.length,
          skippedAsDuplicate: skippedDuplicates.length,
          failed: errors.length,
          total: taskList.length,
        },
      });
    } catch (error) {
      console.error("Bulk import error:", error);
      res.status(500).json({ message: "Failed to import tasks" });
    }
  });

  // Create new task
  app.post("/api/tasks", requireAuth, async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      const userId = req.user!.id;
      const quota = await assertCanCreateTasks(userId, 1);
      if (!quota.ok) {
        return res.status(413).json({ message: quota.message });
      }
      const fingerprint = computeTaskFingerprint(validatedData);
      if (await hasImportFingerprint(userId, fingerprint)) {
        return res.status(409).json({ message: "A matching task already exists." });
      }

      let task = await storage.createTask(userId, validatedData);
      await recordImportFingerprint(userId, fingerprint, "manual_create", task.id);

      const allTasks = await storage.getTasks(userId);
      const priorityResult = await PriorityEngine.calculatePriority(
        task.activity,
        task.notes || "",
        task.urgency,
        task.impact,
        task.effort,
        allTasks.filter(t => t.id !== task.id)
      );

      const classification = await classifyTaskWithFallback(task.activity, task.notes || "", true);

      task = await storage.updateTask(userId, {
        id: task.id,
        priority: priorityResult.priority,
        priorityScore: Math.round(priorityResult.score * 10),
        classification,
        isRepeated: priorityResult.isRepeated,
      }) || task;

      learnFromTask(userId, task, allTasks).catch(err =>
        console.error("[PatternEngine] learn error:", err)
      );

      let classificationReward = null;
      if (task.classification && task.classification !== "General") {
        classificationReward = await awardCoinsForClassification(userId, task);
      }

      res.status(201).json({ ...task, classificationReward });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to create task" });
      }
    }
  });

  // Update task
  app.put("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const validatedData = updateTaskSchema.parse({
        ...req.body,
        id: req.params.id,
      });
      const userId = req.user!.id;

      const existingTask = await storage.getTask(userId, req.params.id);
      const previousStatus = existingTask?.status || "pending";

      let task = await storage.updateTask(userId, validatedData);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (validatedData.activity || validatedData.notes) {
        const allTasks = await storage.getTasks(userId);
        const priorityResult = await PriorityEngine.calculatePriority(
          task!.activity,
          task!.notes || "",
          task!.urgency,
          task!.impact,
          task!.effort,
          allTasks.filter(t => t.id !== task!.id)
        );

        const classification = await classifyTaskWithFallback(task!.activity, task!.notes || "", true);

        task = await storage.updateTask(userId, {
          id: task!.id,
          priority: priorityResult.priority,
          priorityScore: Math.round(priorityResult.score * 10),
          classification,
          isRepeated: priorityResult.isRepeated,
        }) || task;
      }

      let coinReward = null;
      if (task!.status === "completed" && previousStatus !== "completed") {
        coinReward = await awardCoinsForCompletion(userId, task!, previousStatus);
      }

      let classificationReward = null;
      const previousClassification = existingTask?.classification;
      if (task!.classification && task!.classification !== "General" && task!.classification !== previousClassification) {
        classificationReward = await awardCoinsForClassification(userId, task!);
      }

      res.json({ ...task, coinReward, classificationReward });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to update task" });
      }
    }
  });

  // Delete task
  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteTask(req.user!.id, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Reorder tasks
  app.patch("/api/tasks/reorder", requireAuth, async (req, res) => {
    try {
      const { taskIds } = reorderTasksSchema.parse(req.body);
      await storage.reorderTasks(req.user!.id, taskIds);
      res.json({ message: "Tasks reordered successfully" });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to reorder tasks" });
      }
    }
  });

  // Recalculate all priorities
  app.post("/api/tasks/recalculate", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);

      for (const task of allTasks) {
        const priorityResult = await PriorityEngine.calculatePriority(
          task.activity,
          task.notes || "",
          task.urgency,
          task.impact,
          task.effort,
          allTasks.filter(t => t.id !== task.id)
        );

        const classification = await classifyTaskWithFallback(task.activity, task.notes || "", false);

        await storage.updateTask(userId, {
          id: task.id,
          priority: priorityResult.priority,
          priorityScore: Math.round(priorityResult.score * 10),
          classification,
          isRepeated: priorityResult.isRepeated,
        });
      }

      res.json({ message: "All priorities recalculated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to recalculate priorities" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Google Sheets routes (protected)
  // ════════════════════════════════════════════════════════════════════════

  app.use("/api/google-sheets", apiLimiter);

  app.get("/api/google-sheets/auth-url", requireAuth, async (req, res) => {
    try {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(400).json({
          message: "Google API credentials not configured. Please check your environment variables."
        });
      }
      const googleSheets = createGoogleSheetsAPI();
      const authUrl = googleSheets.generateAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate auth URL" });
    }
  });

  app.post("/api/google-sheets/auth-callback", requireAuth, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ message: "Authorization code required" });
      }
      const googleSheets = createGoogleSheetsAPI();
      const tokens = await googleSheets.getTokens(code);
      res.json({
        message: "Authentication successful",
        tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to exchange authorization code" });
    }
  });

  app.post("/api/google-sheets/spreadsheet/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { accessToken, refreshToken } = req.body ?? {};

      if (!accessToken || typeof accessToken !== "string") {
        return res.status(400).json({ message: "Access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken,
        refreshToken: typeof refreshToken === "string" ? refreshToken : undefined,
      });

      const info = await googleSheets.getSpreadsheetInfo(id);
      res.json(info);
    } catch (error) {
      res.status(500).json({ message: "Failed to get spreadsheet info" });
    }
  });

  app.post("/api/google-sheets/create-spreadsheet", requireAuth, async (req, res) => {
    try {
      const { title, accessToken, refreshToken } = req.body;

      if (!accessToken) {
        return res.status(400).json({ message: "Access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken,
        refreshToken
      });

      const spreadsheetId = await googleSheets.createTaskSpreadsheet(title);
      res.json({ 
        spreadsheetId,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to create spreadsheet" });
    }
  });

  app.post("/api/google-sheets/export", requireAuth, async (req, res) => {
    try {
      const { spreadsheetId, sheetName, accessToken, refreshToken } = req.body;

      if (!spreadsheetId || !accessToken) {
        return res.status(400).json({ message: "Spreadsheet ID and access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken,
        refreshToken
      });

      const tasks = await storage.getTasks(req.user!.id);
      const result = await googleSheets.exportTasks(spreadsheetId, tasks, sheetName);
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to export tasks to Google Sheets" });
    }
  });

  app.post("/api/google-sheets/import", requireAuth, async (req, res) => {
    try {
      const { spreadsheetId, sheetName, accessToken, refreshToken } = req.body;
      const userId = req.user!.id;

      if (!spreadsheetId || !accessToken) {
        return res.status(400).json({ message: "Spreadsheet ID and access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken,
        refreshToken
      });

      const importedTasks = await googleSheets.importTasks(spreadsheetId, sheetName);

      const processedTasks = [];
      let skippedAsDuplicate = 0;
      for (const taskData of importedTasks) {
        try {
          const { id, ...taskWithoutId } = taskData;
          const validatedData = insertTaskSchema.parse(taskWithoutId);
          const fingerprint = computeTaskFingerprint(validatedData);
          if (await hasImportFingerprint(userId, fingerprint)) {
            skippedAsDuplicate += 1;
            continue;
          }

          let task = await storage.createTask(userId, validatedData);
          await recordImportFingerprint(userId, fingerprint, "google_sheets_import", task.id);

          const allTasks = await storage.getTasks(userId);
          const priorityResult = await PriorityEngine.calculatePriority(
            task.activity,
            task.notes || "",
            task.urgency,
            task.impact,
            task.effort,
            allTasks.filter(t => t.id !== task.id)
          );

          const classification = await classifyTaskWithFallback(task.activity, task.notes || "", false);

          const updatedTask = await storage.updateTask(userId, {
            id: task.id,
            priority: priorityResult.priority,
            priorityScore: Math.round(priorityResult.score * 10),
            classification,
            isRepeated: priorityResult.isRepeated,
          });

          if (updatedTask) task = updatedTask;
          processedTasks.push(task);
        } catch (error) {
          console.warn(`Failed to process imported task:`, error);
        }
      }

      res.json({
        message: "Import completed",
        imported: processedTasks.length,
        skippedAsDuplicate,
        total: importedTasks.length
      });
      await appendSecurityEvent({
        eventType: "google_import_processed",
        actorUserId: userId,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: {
          imported: processedTasks.length,
          skippedAsDuplicate,
          total: importedTasks.length,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to import tasks from Google Sheets" });
    }
  });

  app.post("/api/google-sheets/sync", requireAuth, async (req, res) => {
    try {
      const { spreadsheetId, sheetName, accessToken, refreshToken } = req.body;

      if (!spreadsheetId || !accessToken) {
        return res.status(400).json({ message: "Spreadsheet ID and access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken,
        refreshToken
      });

      const localTasks = await storage.getTasks(req.user!.id);
      const syncResult = await googleSheets.syncTasks(spreadsheetId, localTasks, sheetName);
      
      res.json({
        message: "Sync completed",
        exported: syncResult.exported,
        conflicts: syncResult.conflicts.length,
        conflictDetails: syncResult.conflicts
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to sync with Google Sheets" });
    }
  });

  // ── Checklist (PDF download & OCR scan) ──────────────────────────────────
  app.use("/api/checklist", apiLimiter);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  const ocrLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many scan requests — try again in a few minutes" },
  });

  const checklistApplySchema = z.object({
    updates: z.array(z.object({
      taskId: z.string().min(1),
      status: z.enum(["pending", "in-progress", "completed"]),
    })).min(1).max(500),
  });

  app.get("/api/checklist/:date", requireAuth, async (req, res) => {
    try {
      const { date } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
      }

      const allTasks = await storage.getTasks(req.user!.id);
      const dayTasks = allTasks.filter(t => t.date === date);

      const userName = req.user!.displayName || req.user!.email;
      const pdfDoc = generateChecklistPDF(dayTasks, date, userName);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="AxTask-Checklist-${date}.pdf"`);

      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (error) {
      console.error("Checklist PDF error:", error);
      res.status(500).json({ message: "Failed to generate checklist" });
    }
  });

  app.post("/api/checklist/scan", requireAuth, ocrLimiter, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      const date = typeof req.body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
        ? req.body.date
        : undefined;
      const allTasks = await storage.getTasks(req.user!.id);
      const dayTasks = date
        ? allTasks.filter(t => t.date === date)
        : allTasks.filter(t => t.status !== "completed");

      const result = await processChecklistImage(req.file.buffer, dayTasks);

      res.json(result);
    } catch (error) {
      console.error("OCR scan error:", error);
      res.status(500).json({ message: "Failed to process checklist image" });
    }
  });

  app.post("/api/checklist/apply", requireAuth, async (req, res) => {
    try {
      const parsed = checklistApplySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const { updates } = parsed.data;
      const userId = req.user!.id;
      const results: { taskId: string; status: string }[] = [];

      for (const { taskId, status } of updates) {
        const task = await storage.getTask(userId, taskId);
        if (!task) continue;

        await storage.updateTask(userId, { id: taskId, status });
        results.push({ taskId, status });
      }

      res.json({ updated: results.length, results });
    } catch (error) {
      console.error("Checklist apply error:", error);
      res.status(500).json({ message: "Failed to apply updates" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Planner / AI Agent routes (protected)
  // ════════════════════════════════════════════════════════════════════════

  function isOverdueTask(t: { date: string; time: string | null }, todayStr: string, now: Date): boolean {
    if (t.date < todayStr) return true;
    if (t.date === todayStr && t.time) {
      const [h, m] = t.time.split(":").map(Number);
      const taskTime = new Date(now);
      taskTime.setHours(h, m, 0, 0);
      return taskTime < now;
    }
    return false;
  }

  app.use("/api/planner", apiLimiter);

  app.get("/api/planner/briefing", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];

      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());

      const pendingTasks = allTasks.filter(t => t.status !== "completed");

      const overdueTasks = pendingTasks.filter(t => isOverdueTask(t, todayStr, now));

      const dueTodayTasks = pendingTasks.filter(t => t.date === todayStr);

      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      const dueWithinHourTasks = pendingTasks.filter(t => {
        if (t.date !== todayStr || !t.time) return false;
        const [h, m] = t.time.split(":").map(Number);
        const taskTime = new Date(now);
        taskTime.setHours(h, m, 0, 0);
        return taskTime >= now && taskTime <= oneHourFromNow;
      });

      const weekDays: { date: string; dayName: string; count: number; load: "none" | "light" | "moderate" | "heavy" }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        const dayTasks = allTasks.filter(t => t.date === dateStr && t.status !== "completed");
        const cnt = dayTasks.length;
        weekDays.push({
          date: dateStr,
          dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
          count: cnt,
          load: cnt === 0 ? "none" : cnt <= 2 ? "light" : cnt <= 5 ? "moderate" : "heavy",
        });
      }

      const scoredTasks = pendingTasks.map(t => {
        let urgencyBoost = 0;
        const daysUntilDue = Math.floor((new Date(t.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilDue < 0) urgencyBoost = 30;
        else if (daysUntilDue === 0) urgencyBoost = 20;
        else if (daysUntilDue === 1) urgencyBoost = 10;
        else if (daysUntilDue <= 3) urgencyBoost = 5;

        const combinedScore = (t.priorityScore || 0) + urgencyBoost;

        let reason = "";
        if (daysUntilDue < 0) reason = `Overdue by ${Math.abs(daysUntilDue)} day(s)`;
        else if (daysUntilDue === 0 && t.time) reason = `Due today at ${t.time}`;
        else if (daysUntilDue === 0) reason = "Due today";
        else if (daysUntilDue === 1) reason = "Due tomorrow";
        else if (daysUntilDue <= 3) reason = `Due in ${daysUntilDue} days`;

        if (t.priority === "Highest" || t.priority === "High") {
          reason = reason ? `${t.priority} priority — ${reason}` : `${t.priority} priority`;
        }

        return { task: t, combinedScore, reason };
      });

      scoredTasks.sort((a, b) => b.combinedScore - a.combinedScore);
      const topTasks = scoredTasks.slice(0, 3).map(s => ({
        ...s.task,
        reason: s.reason || `Priority: ${s.task.priority}`,
      }));

      const thisWeekTotal = weekDays.reduce((sum, d) => sum + d.count, 0);

      res.json({
        today: todayStr,
        overdue: { count: overdueTasks.length, tasks: overdueTasks.slice(0, 5) },
        dueToday: { count: dueTodayTasks.length, tasks: dueTodayTasks.slice(0, 5) },
        dueWithinHour: { count: dueWithinHourTasks.length, tasks: dueWithinHourTasks },
        thisWeek: { total: thisWeekTotal, days: weekDays },
        topRecommended: topTasks,
        totalPending: pendingTasks.length,
      });
    } catch (error) {
      console.error("Planner briefing error:", error);
      res.status(500).json({ message: "Failed to generate planner briefing" });
    }
  });

  app.post("/api/planner/ask", requireAuth, async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || typeof question !== "string") {
        return res.status(400).json({ message: "Question is required" });
      }
      if (question.length > 500) {
        return res.status(400).json({ message: "Question must be under 500 characters" });
      }

      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];

      const result = processPlannerQuery(question, allTasks, todayStr, now);
      res.json({ answer: result.answer, relatedTasks: result.relatedTasks.slice(0, 5) });
    } catch (error) {
      console.error("Planner Q&A error:", error);
      res.status(500).json({ message: "Failed to answer question" });
    }
  });

  app.post("/api/voice/process", voiceLimiter, requireAuth, async (req, res) => {
    try {
      const { transcript } = req.body;
      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ message: "Transcript is required" });
      }
      if (transcript.length > 1000) {
        return res.status(400).json({ message: "Transcript must be under 1000 characters" });
      }
      const sanitizedTranscript = transcript.replace(/<[^>]*>/g, "").trim();

      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];

      const result = await dispatchVoiceCommand(sanitizedTranscript, allTasks, userId, todayStr, now);
      res.json(result);
    } catch (error) {
      console.error("Voice processing error:", error);
      res.status(500).json({ message: "Failed to process voice command" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Task Review routes (bulk voice-driven task management)
  // ════════════════════════════════════════════════════════════════════════

  app.post("/api/tasks/review", requireAuth, async (req, res) => {
    try {
      const { transcript } = req.body;
      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ message: "Transcript is required" });
      }
      if (transcript.length > 2000) {
        return res.status(400).json({ message: "Transcript must be under 2000 characters" });
      }
      const sanitized = transcript.replace(/<[^>]*>/g, "").trim();

      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);
      const now = new Date();
      const result = processTaskReview(sanitized, allTasks, now);
      res.json(result);
    } catch (error) {
      console.error("Task review error:", error);
      res.status(500).json({ message: "Failed to process task review" });
    }
  });

  app.post("/api/tasks/review/apply", requireAuth, async (req, res) => {
    try {
      const { actions } = req.body;
      if (!Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({ message: "Actions array is required" });
      }
      if (actions.length > 50) {
        return res.status(400).json({ message: "Maximum 50 actions per batch" });
      }

      const userId = req.user!.id;
      const results: Array<{ taskId: string; success: boolean; error?: string }> = [];

      for (const action of actions as ReviewAction[]) {
        try {
          if (!action.taskId || !action.type) {
            results.push({ taskId: action.taskId || "unknown", success: false, error: "Invalid action" });
            continue;
          }

          const existingTask = await storage.getTask(userId, action.taskId);
          if (!existingTask) {
            results.push({ taskId: action.taskId, success: false, error: "Task not found or access denied" });
            continue;
          }

          const previousStatus = existingTask.status;

          switch (action.type) {
            case "complete": {
              const updatedTask = await storage.updateTask(userId, { id: action.taskId, status: "completed" });
              if (updatedTask) {
                try {
                  await awardCoinsForCompletion(userId, updatedTask, previousStatus);
                } catch (coinErr) {
                  console.error(`Coin award failed for task ${action.taskId}:`, coinErr);
                }
              }
              results.push({ taskId: action.taskId, success: true });
              break;
            }
            case "reschedule": {
              const newDate = action.details?.newDate;
              if (typeof newDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                await storage.updateTask(userId, { id: action.taskId, date: newDate });
                results.push({ taskId: action.taskId, success: true });
              } else {
                results.push({ taskId: action.taskId, success: false, error: "Invalid date" });
              }
              break;
            }
            case "update": {
              const updatePayload: UpdateTask = { id: action.taskId };
              const validPriorities = ["Lowest", "Low", "Medium", "Medium-High", "High", "Highest"];
              if (action.details?.priority && typeof action.details.priority === "string" && validPriorities.includes(action.details.priority)) {
                updatePayload.priority = action.details.priority;
              }
              if (action.details?.notes && typeof action.details.notes === "string") {
                updatePayload.notes = action.details.notes.slice(0, 2000);
              }
              if (Object.keys(updatePayload).length > 1) {
                await storage.updateTask(userId, updatePayload);
                results.push({ taskId: action.taskId, success: true });
              } else {
                results.push({ taskId: action.taskId, success: false, error: "No valid updates" });
              }
              break;
            }
            default:
              results.push({ taskId: action.taskId, success: false, error: "Unknown action type" });
          }
        } catch (err) {
          results.push({ taskId: action.taskId, success: false, error: "Processing error" });
        }
      }

      const applied = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      res.json({ applied, failed, results });
    } catch (error) {
      console.error("Task review apply error:", error);
      res.status(500).json({ message: "Failed to apply task review" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Pattern Learning routes (protected)
  // ════════════════════════════════════════════════════════════════════════

  app.get("/api/patterns/insights", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const patterns = await getPatterns(userId);
      const insights = getInsights(patterns);
      res.json({ insights, patternCount: patterns.length });
    } catch (error) {
      console.error("Pattern insights error:", error);
      res.status(500).json({ message: "Failed to get pattern insights" });
    }
  });

  app.post("/api/patterns/learn", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);
      const patterns = await analyzeTaskHistory(userId, allTasks);
      const insights = getInsights(patterns);
      res.json({ learned: patterns.length, insights });
    } catch (error) {
      console.error("Pattern learning error:", error);
      res.status(500).json({ message: "Failed to analyze patterns" });
    }
  });

  app.post("/api/patterns/suggest-deadline", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { activity } = req.body;
      if (!activity || typeof activity !== "string") {
        return res.status(400).json({ message: "Activity is required" });
      }
      const patterns = await getPatterns(userId);
      const suggestion = suggestDeadline(activity, patterns);
      res.json({ suggestion });
    } catch (error) {
      console.error("Deadline suggestion error:", error);
      res.status(500).json({ message: "Failed to suggest deadline" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Gamification routes (protected)
  // ════════════════════════════════════════════════════════════════════════

  app.use("/api/gamification", apiLimiter);
  app.use("/api/mfa", apiLimiter);
  app.use("/api/account", apiLimiter);
  app.use("/api/billing", apiLimiter);

  await seedRewardsCatalog();
  await seedOfflineSkillTree();

  app.get("/api/gamification/wallet", requireAuth, async (req, res) => {
    try {
      const wallet = await getOrCreateWallet(req.user!.id);
      if (wallet.currentStreak > 0 && wallet.lastCompletionDate) {
        const lastDate = new Date(wallet.lastCompletionDate);
        lastDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          wallet.currentStreak = 0;
          await resetStreak(req.user!.id);
        }
      }
      res.json(wallet);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  app.get("/api/gamification/transactions", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const txs = await getTransactions(req.user!.id, limit);
      res.json(txs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.get("/api/gamification/badges", requireAuth, async (req, res) => {
    try {
      const earned = await getUserBadges(req.user!.id);
      res.json({ earned, definitions: BADGE_DEFINITIONS });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

  app.get("/api/gamification/rewards", requireAuth, async (_req, res) => {
    try {
      const catalog = await getRewardsCatalog();
      res.json(catalog);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rewards" });
    }
  });

  app.get("/api/gamification/my-rewards", requireAuth, async (req, res) => {
    try {
      const rewards = await getUserRewards(req.user!.id);
      res.json(rewards);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch your rewards" });
    }
  });

  app.post("/api/gamification/redeem", requireAuth, async (req, res) => {
    try {
      const { rewardId } = req.body;
      if (!rewardId || typeof rewardId !== "string") {
        return res.status(400).json({ message: "Reward ID is required" });
      }
      const success = await redeemReward(req.user!.id, rewardId);
      if (!success) {
        return res.status(400).json({ message: "Insufficient coins or reward not found" });
      }
      const wallet = await getOrCreateWallet(req.user!.id);
      res.json({ message: "Reward redeemed!", wallet });
    } catch (error) {
      res.status(500).json({ message: "Failed to redeem reward" });
    }
  });

  app.get("/api/gamification/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const [wallet, badges, rewards, txs, classificationStats] = await Promise.all([
        getOrCreateWallet(userId),
        getUserBadges(userId),
        getUserRewards(userId),
        getTransactions(userId, 20),
        getUserClassificationStats(userId),
      ]);
      res.json({ wallet, badges, rewards, transactions: txs, definitions: BADGE_DEFINITIONS, classificationStats });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  const offlineSkillUnlockSchema = z.object({
    skillKey: z.string().min(2).max(80),
  });

  app.get("/api/gamification/offline-generator", requireAuth, async (req, res) => {
    try {
      const status = await getOfflineGeneratorStatus(req.user!.id);
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch offline generator status" });
    }
  });

  app.post("/api/gamification/offline-generator/buy", requireAuth, async (req, res) => {
    try {
      const result = await buyOfflineGenerator(req.user!.id);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      const status = await getOfflineGeneratorStatus(req.user!.id);
      res.status(201).json({ ...result, status });
    } catch (error) {
      res.status(500).json({ message: "Failed to buy offline generator" });
    }
  });

  app.post("/api/gamification/offline-generator/upgrade", requireAuth, async (req, res) => {
    try {
      const result = await upgradeOfflineGenerator(req.user!.id);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      const status = await getOfflineGeneratorStatus(req.user!.id);
      res.json({ ...result, status });
    } catch (error) {
      res.status(500).json({ message: "Failed to upgrade offline generator" });
    }
  });

  app.post("/api/gamification/offline-generator/claim", requireAuth, async (req, res) => {
    try {
      const result = await claimOfflineGeneratorCoins(req.user!.id);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      const status = await getOfflineGeneratorStatus(req.user!.id);
      res.json({ ...result, status });
    } catch (error) {
      res.status(500).json({ message: "Failed to claim offline coins" });
    }
  });

  app.get("/api/gamification/offline-skills", requireAuth, async (req, res) => {
    try {
      const skills = await getOfflineSkillTree(req.user!.id);
      res.json(skills);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch offline skills" });
    }
  });

  app.post("/api/gamification/offline-skills/unlock", requireAuth, async (req, res) => {
    try {
      const { skillKey } = offlineSkillUnlockSchema.parse(req.body);
      const result = await unlockOfflineSkill(req.user!.id, skillKey);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      const skills = await getOfflineSkillTree(req.user!.id);
      const status = await getOfflineGeneratorStatus(req.user!.id);
      res.json({ ...result, skills, status });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to unlock offline skill" });
    }
  });

  // ── Universal classifier API (protected) ───────────────────────────────────
  const classifySchema = z.object({
    activity: z.string().min(1).max(500),
    notes: z.string().max(5000).optional().default(""),
    preferExternal: z.boolean().optional().default(true),
  });

  app.post("/api/classification/classify", requireAuth, async (req, res) => {
    try {
      const payload = classifySchema.parse(req.body);
      const result = await classifyWithFallback(payload.activity, payload.notes, {
        preferExternal: payload.preferExternal,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Classification failed" });
    }
  });

  // ── Feedback + attachments ────────────────────────────────────────────────
  const feedbackSchema = z.object({
    message: z.string().min(5).max(5000),
    attachmentAssetIds: z.array(z.string().min(1)).max(10).default([]),
    screenshotMeta: z.array(z.object({
      fileName: z.string().optional(),
      mimeType: z.string().min(3),
      byteSize: z.number().int().nonnegative().max(10 * 1024 * 1024),
    })).max(10).default([]),
  });

  const uploadUrlSchema = z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(3).max(128),
    byteSize: z.number().int().positive().max(10 * 1024 * 1024),
    kind: z.string().min(2).max(40).default("feedback"),
  });

  const feedbackProcessSchema = z.object({
    message: z.string().min(5).max(5000),
    attachmentCount: z.number().int().min(0).max(10).default(0),
  });

  app.post("/api/attachments/upload-url", requireAuth, async (req, res) => {
    try {
      const payload = uploadUrlSchema.parse(req.body);
      const canStore = await assertCanStoreAttachment(req.user!.id, payload.byteSize);
      if (!canStore.ok) {
        return res.status(413).json({ message: canStore.message });
      }

      const tempAsset = await createAttachmentAsset({
        userId: req.user!.id,
        kind: payload.kind,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        byteSize: payload.byteSize,
        metadataJson: JSON.stringify({ status: "pending_upload", source: "signed_url" }),
      });

      const storageKey = buildAttachmentStorageKey(req.user!.id, tempAsset.id, payload.fileName);
      await markAttachmentAssetUploaded(req.user!.id, tempAsset.id, {
        status: "pending_upload",
        storageKey,
      });

      const token = createUploadToken({
        userId: req.user!.id,
        assetId: tempAsset.id,
        storageKey,
        mimeType: payload.mimeType,
        byteSize: payload.byteSize,
        exp: Date.now() + 15 * 60 * 1000,
      }, getUploadSigningSecret());

      res.status(201).json({
        assetId: tempAsset.id,
        uploadUrl: `/api/attachments/upload/${encodeURIComponent(token)}`,
        expiresInSeconds: 900,
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  app.put("/api/attachments/upload/:token", requireAuth, express.raw({ type: "*/*", limit: "12mb" }), async (req, res) => {
    try {
      const parsed = verifyUploadToken(req.params.token, getUploadSigningSecret());
      if (!parsed) {
        return res.status(403).json({ message: "Invalid or expired upload token" });
      }
      if (parsed.userId !== req.user!.id) {
        return res.status(403).json({ message: "Upload token user mismatch" });
      }

      const asset = await getAttachmentAssetById(req.user!.id, parsed.assetId);
      if (!asset) {
        return res.status(404).json({ message: "Attachment asset not found" });
      }
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
      if (body.length !== parsed.byteSize) {
        return res.status(400).json({ message: "Uploaded bytes do not match declared file size" });
      }
      const scan = scanAttachmentBuffer(body, parsed.mimeType);
      if (!scan.clean) {
        await softDeleteAttachmentAsset(req.user!.id, parsed.assetId);
        return res.status(400).json({ message: `Attachment scan failed: ${scan.reason}` });
      }

      await writeAttachmentObject(parsed.storageKey, body);
      await markAttachmentAssetUploaded(req.user!.id, parsed.assetId, {
        status: "uploaded",
        uploadedAt: new Date().toISOString(),
        storageKey: parsed.storageKey,
      });

      await appendSecurityEvent({
        eventType: "attachment_uploaded",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: { assetId: parsed.assetId, byteSize: body.length },
      });
      res.json({ message: "Attachment uploaded", assetId: parsed.assetId });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Upload failed" });
    }
  });

  app.post("/api/feedback", requireAuth, async (req, res) => {
    try {
      const parsed = feedbackSchema.parse(req.body);
      const createdAssets = [];
      let linkedAssets = 0;

      if (parsed.attachmentAssetIds.length > 0) {
        for (const assetId of parsed.attachmentAssetIds) {
          const existing = await getAttachmentAssetById(req.user!.id, assetId);
          if (!existing || existing.deletedAt) continue;
          linkedAssets += 1;
        }
      }

      for (const file of parsed.screenshotMeta) {
        const canStore = await assertCanStoreAttachment(req.user!.id, file.byteSize);
        if (!canStore.ok) {
          return res.status(413).json({ message: canStore.message });
        }
        const asset = await createAttachmentAsset({
          userId: req.user!.id,
          kind: "feedback",
          fileName: file.fileName,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
          metadataJson: JSON.stringify({ source: "feedback_form" }),
        });
        createdAssets.push(asset);
      }

      const totalAttachments = createdAssets.length + linkedAssets;
      const analysis = await processFeedbackWithEngines(parsed.message, totalAttachments);

      await logSecurityEvent(
        "feedback_submitted",
        req.user!.id,
        undefined,
        req.ip,
        `Feedback submitted (${parsed.message.length} chars, ${totalAttachments} attachments, ${analysis.classification}/${analysis.priority})`,
      );
      await appendSecurityEvent({
        eventType: "feedback_processed",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 201,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: {
          messageLength: parsed.message.length,
          attachments: totalAttachments,
          analysis,
        },
      });
      res.status(201).json({
        message: "Feedback submitted",
        attachments: totalAttachments,
        analysis,
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  app.post("/api/feedback/process", requireAuth, async (req, res) => {
    try {
      const payload = feedbackProcessSchema.parse(req.body);
      const analysis = await processFeedbackWithEngines(payload.message, payload.attachmentCount);
      res.json(analysis);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to process feedback" });
    }
  });

  app.delete("/api/attachments/:assetId", requireAuth, async (req, res) => {
    try {
      const asset = await getAttachmentAssetById(req.user!.id, req.params.assetId);
      if (!asset) return res.status(404).json({ message: "Attachment not found" });
      const metadata = asset.metadataJson ? JSON.parse(asset.metadataJson) : {};
      if (metadata?.storageKey) {
        await deleteAttachmentObject(String(metadata.storageKey));
      }
      await softDeleteAttachmentAsset(req.user!.id, asset.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete attachment" });
    }
  });

  app.get("/api/attachments", requireAuth, async (req, res) => {
    try {
      const kind = req.query.kind && typeof req.query.kind === "string" ? req.query.kind : undefined;
      const assets = await getAttachmentAssets(req.user!.id, kind);
      res.json(assets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch attachments" });
    }
  });

  // ── Invoicing foundation routes ───────────────────────────────────────────
  const invoiceCreateSchema = z.object({
    invoiceNumber: z.string().min(3).max(64),
    amountCents: z.number().int().positive(),
    currency: z.string().length(3).default("USD"),
    dueDate: z.string().optional(),
  });

  const mfaChallengeBodySchema = z.object({
    purpose: z.string().min(3).max(120),
    channel: z.enum(["email", "sms"]).optional().default("email"),
    phoneE164: z.string().optional(),
  });

  const postMfaChallenge = async (req: Request, res: Response) => {
    try {
      const body = mfaChallengeBodySchema.parse(req.body);
      const channel = body.channel;

      if (!canDeliverMfaInProduction(channel)) {
        return res.status(503).json({
          message:
            channel === "email"
              ? "Email OTP is not configured. Set RESEND_API_KEY (and optional RESEND_FROM) for production."
              : "SMS OTP is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER for production.",
        });
      }

      const contact = await getUserContactForMfa(req.user!.id);
      if (!contact) return res.status(404).json({ message: "User not found" });

      let smsDestinationE164: string | null = null;

      if (channel === "sms") {
        if (body.purpose === MFA_PURPOSES.ACCOUNT_VERIFY_PHONE) {
          if (!body.phoneE164?.trim()) {
            return res.status(400).json({ message: "phoneE164 is required to verify a new phone number" });
          }
          const normalized = normalizeToE164(body.phoneE164);
          if (!normalized) {
            return res.status(400).json({ message: "Invalid phone number" });
          }
          smsDestinationE164 = normalized;
        } else {
          if (!contact.phoneVerifiedAt || !contact.phoneE164) {
            return res.status(400).json({
              message: "Verify a phone number in Account settings before using SMS codes for billing and other steps.",
            });
          }
          smsDestinationE164 = contact.phoneE164;
        }
      }

      const challenge = await createMfaChallenge(req.user!.id, body.purpose, {
        deliveryChannel: channel,
        smsDestinationE164,
      });

      const deliver = await deliverMfaOtp({
        channel,
        code: challenge.code,
        purpose: body.purpose,
        email: contact.email,
        phoneE164: channel === "sms" ? smsDestinationE164 : null,
      });

      if (!deliver.ok) {
        await deleteMfaChallengeById(challenge.challengeId, req.user!.id);
        return res.status(502).json({ message: deliver.error });
      }

      const maskedDestination =
        channel === "email"
          ? maskEmailForOtp(contact.email)
          : maskE164ForDisplay(smsDestinationE164);

      await appendSecurityEvent({
        eventType: "mfa_challenge_created",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 201,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: { purpose: body.purpose, channel },
      });

      res.status(201).json({
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
        deliveredVia: channel,
        maskedDestination,
        devCode: process.env.NODE_ENV === "production" ? undefined : challenge.code,
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to create MFA challenge" });
    }
  };

  app.post("/api/mfa/challenge", requireAuth, postMfaChallenge);
  app.post("/api/invoices/mfa/challenge", requireAuth, postMfaChallenge);

  app.post("/api/invoices", requireAuth, async (req, res) => {
    try {
      const idemKey = req.get("x-idempotency-key");
      if (!idemKey) {
        return res.status(400).json({ message: "x-idempotency-key header is required" });
      }
      const idem = await ensureIdempotencyKey(idemKey, "/api/invoices", req.user!.id);
      if (!idem.fresh) {
        return res.status(409).json({ message: "Duplicate invoice request" });
      }

      const payload = invoiceCreateSchema.parse(req.body);
      const invoice = await createInvoice({
        userId: req.user!.id,
        invoiceNumber: payload.invoiceNumber,
        amountCents: payload.amountCents,
        currency: payload.currency,
        dueDate: payload.dueDate,
      });
      res.status(201).json(invoice);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  app.post("/api/invoices/:id/issue", requireAuth, async (req, res) => {
    try {
      const { challengeId, code } = z.object({
        challengeId: z.string().min(1),
        code: z.string().length(6),
      }).parse(req.body);

      const validMfa = await verifyMfaChallenge(req.user!.id, challengeId, code, MFA_PURPOSES.INVOICE_ISSUE);
      if (!validMfa) {
        await appendSecurityEvent({
          eventType: "mfa_verify_failed",
          actorUserId: req.user!.id,
          route: req.path,
          method: req.method,
          statusCode: 403,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.status(403).json({ message: "Invalid MFA challenge or code" });
      }

      const invoice = await issueInvoice(req.params.id, req.user!.id);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      await appendSecurityEvent({
        eventType: "invoice_issued",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: { invoiceId: req.params.id },
      });
      res.json(invoice);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to issue invoice" });
    }
  });

  app.post("/api/invoices/:id/confirm-payment", requireAuth, async (req, res) => {
    try {
      const { challengeId, code, confirmationNumber, externalReference } = z.object({
        challengeId: z.string().min(1),
        code: z.string().length(6),
        confirmationNumber: z.string().min(3).max(128),
        externalReference: z.string().max(255).optional(),
      }).parse(req.body);

      const validMfa = await verifyMfaChallenge(req.user!.id, challengeId, code, MFA_PURPOSES.INVOICE_CONFIRM_PAYMENT);
      if (!validMfa) {
        await appendSecurityEvent({
          eventType: "mfa_verify_failed",
          actorUserId: req.user!.id,
          route: req.path,
          method: req.method,
          statusCode: 403,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.status(403).json({ message: "Invalid MFA challenge or code" });
      }

      const invoice = await confirmInvoicePayment(req.params.id, req.user!.id, confirmationNumber, externalReference);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      await appendSecurityEvent({
        eventType: "invoice_payment_confirmed",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: { invoiceId: req.params.id, confirmationNumber },
      });
      res.json(invoice);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to confirm payment" });
    }
  });

  app.get("/api/invoices", requireAuth, async (_req, res) => {
    try {
      const invoices = await listInvoices(200);
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get("/api/invoices/:id/events", requireAuth, async (req, res) => {
    try {
      const events = await listInvoiceEvents(req.params.id);
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoice events" });
    }
  });

  app.get("/api/billing/payment-methods", requireAuth, async (req, res) => {
    try {
      const rows = await listBillingPaymentMethodsForUser(req.user!.id);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to load payment methods" });
    }
  });

  app.post("/api/billing/payment-methods", requireAuth, async (req, res) => {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const parsed = z.object({
        challengeId: z.string().min(1),
        code: z.string().length(6).regex(/^\d{6}$/),
        brand: z.enum(["visa", "mastercard", "amex", "discover", "unknown"]),
        last4: z.string().length(4).regex(/^\d{4}$/),
        expMonth: z.number().int().min(1).max(12),
        expYear: z.number().int().min(currentYear).max(currentYear + 25),
        country: z.string().min(2).max(64).optional(),
        postalCode: z.string().min(3).max(16).optional(),
        isDefault: z.boolean().optional().default(true),
      }).parse(req.body);

      if (parsed.expYear === currentYear && parsed.expMonth < currentMonth) {
        return res.status(400).json({ message: "Card appears expired" });
      }

      const validMfa = await verifyMfaChallenge(
        req.user!.id,
        parsed.challengeId,
        parsed.code,
        MFA_PURPOSES.BILLING_ADD_PAYMENT_METHOD,
      );
      if (!validMfa) {
        await appendSecurityEvent({
          eventType: "mfa_verify_failed",
          actorUserId: req.user!.id,
          route: req.path,
          method: req.method,
          statusCode: 403,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
          payload: { context: "billing_add_payment_method" },
        });
        return res.status(403).json({ message: "Invalid or expired verification code" });
      }

      const pm = await createBillingPaymentMethod({
        userId: req.user!.id,
        brand: parsed.brand,
        last4: parsed.last4,
        expMonth: parsed.expMonth,
        expYear: parsed.expYear,
        country: parsed.country,
        postalCode: parsed.postalCode,
        isDefault: parsed.isDefault ?? true,
      });
      await appendSecurityEvent({
        eventType: "billing_payment_method_added",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 201,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: { paymentMethodId: pm.id, brand: pm.brand, last4: pm.last4 },
      });
      res.status(201).json(pm);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to save payment method" });
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
      res.json({ message: "Phone verified", user: fresh });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to verify phone" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Classification Contribution & Confirmation routes
  // ════════════════════════════════════════════════════════════════════════

  app.get("/api/tasks/:id/classifications", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const taskId = req.params.id;

      const { canAccess } = await canAccessTask(userId, taskId);
      if (!canAccess) return res.status(403).json({ message: "Access denied" });

      const [contributions, hasConfirmed] = await Promise.all([
        getContributionsForTask(taskId),
        hasUserConfirmedTask(taskId, userId),
      ]);
      const isContributor = contributions.some(c => c.userId === userId);
      res.json({ contributions, hasConfirmed, isContributor });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch classifications" });
    }
  });

  app.post("/api/tasks/:id/confirm-classification", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const taskId = req.params.id;

      const { canAccess } = await canAccessTask(userId, taskId);
      if (!canAccess) return res.status(403).json({ message: "Access denied" });

      const result = await awardCoinsForConfirmation(userId, taskId);
      if (!result) {
        return res.status(400).json({ message: "Already confirmed or you are the original classifier" });
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to confirm classification" });
    }
  });

  app.post("/api/tasks/:id/reclassify", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const taskId = req.params.id;
      const { classification } = req.body;

      const validCategories = ["Crisis", "Development", "Meeting", "Research", "Maintenance", "Administrative", "General"];
      if (!classification || !validCategories.includes(classification)) {
        return res.status(400).json({ message: "Invalid classification category" });
      }

      const accessCheck = await canAccessTask(userId, taskId);
      if (!accessCheck.canAccess) return res.status(403).json({ message: "Access denied" });

      const existingTask = await storage.getTask(userId, taskId);
      if (!existingTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (existingTask.classification === classification) {
        return res.status(400).json({ message: "Task is already classified as " + classification });
      }

      const task = await storage.updateTask(userId, {
        id: taskId,
        classification,
      });

      let classificationReward = null;
      if (classification !== "General") {
        classificationReward = await awardCoinsForClassification(userId, task!);
      }

      res.json({ ...task, classificationReward });
    } catch (error) {
      res.status(500).json({ message: "Failed to reclassify task" });
    }
  });

  app.get("/api/gamification/classification-stats", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const stats = await getUserClassificationStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch classification stats" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Admin routes (protected — require admin role)
  // ════════════════════════════════════════════════════════════════════════

  app.use("/api/admin", apiLimiter);

  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  }

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const userList = await getAllUsers();
      res.json(userList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:userId/ban", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
        return res.status(400).json({ message: "Ban reason is required (min 3 characters)" });
      }
      if (userId === req.user!.id) {
        return res.status(400).json({ message: "You cannot ban yourself" });
      }

      const success = await banUser(userId, req.user!.id, reason.trim(), req.ip);
      if (!success) {
        return res.status(400).json({ message: "Cannot ban this user (not found or is an admin)" });
      }
      res.json({ message: "User has been banned" });
    } catch (error) {
      res.status(500).json({ message: "Failed to ban user" });
    }
  });

  app.post("/api/admin/users/:userId/unban", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const success = await unbanUser(userId, req.user!.id, req.ip);
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "User has been unbanned" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unban user" });
    }
  });

  app.post("/api/admin/ban/:userId", requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;
    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return res.status(400).json({ message: "Ban reason is required (min 3 characters)" });
    }
    if (userId === req.user!.id) {
      return res.status(400).json({ message: "You cannot ban yourself" });
    }
    try {
      const success = await banUser(userId, req.user!.id, reason.trim(), req.ip);
      if (!success) return res.status(400).json({ message: "Cannot ban this user (not found or is an admin)" });
      res.json({ message: "User has been banned" });
    } catch (error) {
      res.status(500).json({ message: "Failed to ban user" });
    }
  });

  app.post("/api/admin/unban/:userId", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const success = await unbanUser(userId, req.user!.id, req.ip);
      if (!success) return res.status(404).json({ message: "User not found" });
      res.json({ message: "User has been unbanned" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unban user" });
    }
  });

  app.get("/api/admin/security-logs", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const logs = await getSecurityLogs(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch security logs" });
    }
  });

  app.get("/api/admin/security-events", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000);
      const events = await getSecurityEvents(limit);
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch security events" });
    }
  });

  app.post("/api/admin/security-alerts/analyze", requireAdmin, async (_req, res) => {
    try {
      const result = await analyzeAndCreateSecurityAlerts();
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze security alerts" });
    }
  });

  app.get("/api/admin/security-alerts", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000);
      const alerts = await getSecurityAlerts(limit);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch security alerts" });
    }
  });

  app.get("/api/admin/feedback-inbox", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
      const items = await listFeedbackInbox(limit);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch feedback inbox" });
    }
  });

  app.get("/api/admin/analytics/overview", requireAdmin, async (_req, res) => {
    try {
      const users = await getAllUsers();
      const tasksByUser = await Promise.all(users.map((u) => storage.getTasks(u.id)));
      const allTasks = tasksByUser.flat();
      const completedTasks = allTasks.filter((t) => t.status === "completed");

      const feedback = await getFeedbackInsightsGlobal(2000);
      const recentEvents = await getSecurityEvents(3000);
      const now = new Date();

      const completionTrend = Array.from({ length: 14 }, (_, idx) => {
        const d = new Date(now);
        d.setDate(now.getDate() - (13 - idx));
        const key = toIsoDate(d);
        const completed = completedTasks.filter(
          (t) => toIsoDate(new Date(t.updatedAt || t.createdAt || new Date())) === key,
        ).length;
        return { date: key, completed };
      });

      const currentWeek = completionTrend.slice(-7).reduce((sum, d) => sum + d.completed, 0);
      const previousWeek = completionTrend.slice(0, 7).reduce((sum, d) => sum + d.completed, 0);
      const completionDelta = currentWeek - previousWeek;

      const pulseByHour = Array.from({ length: 24 }, (_, idx) => {
        const slot = new Date(now);
        slot.setMinutes(0, 0, 0);
        slot.setHours(now.getHours() - (23 - idx));
        const key = `${slot.toISOString().slice(0, 13)}:00:00.000Z`;
        const requests = recentEvents.filter((event) => {
          if (!event.createdAt) return false;
          const eventHour = new Date(event.createdAt);
          eventHour.setMinutes(0, 0, 0);
          return eventHour.toISOString() === key && event.eventType === "api_request";
        }).length;
        return { hour: key, requests };
      });

      const requestVolumeHour = pulseByHour[pulseByHour.length - 1]?.requests || 0;

      const classificationCounts = allTasks.reduce((acc, task) => {
        const key = task.classification || "General";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topClassifications = Object.entries(classificationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([classification, count]) => ({ classification, count }));

      const completionRate = allTasks.length > 0
        ? Math.round((completedTasks.length / allTasks.length) * 100)
        : 0;

      res.json({
        generatedAt: now.toISOString(),
        totals: {
          users: users.length,
          tasks: allTasks.length,
          completedTasks: completedTasks.length,
          completionRate,
          feedbackProcessed: feedback.total,
          urgentFeedback: feedback.urgentCount,
        },
        completionTrend,
        pulseByHour,
        feedbackPriorityDistribution: Object.entries(feedback.byPriority).map(([priority, count]) => ({
          priority,
          count,
        })),
        topClassifications,
        signals: buildAdminSignals({
          completionRate,
          completionDelta,
          requestVolumeHour,
          urgentFeedback: feedback.urgentCount,
          feedbackProcessed: feedback.total,
        }),
        pretext: buildAdminPretext({
          completionRate,
          urgentFeedback: feedback.urgentCount,
          requestVolumeHour,
          completionDelta,
        }),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch admin analytics overview" });
    }
  });

  app.post("/api/admin/feedback-inbox/:feedbackEventId/review", requireAdmin, async (req, res) => {
    try {
      const payload = z.object({ reviewed: z.boolean().default(true) }).parse(req.body || {});
      await appendSecurityEvent({
        eventType: "feedback_review_state_changed",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: {
          feedbackEventId: req.params.feedbackEventId,
          reviewed: payload.reviewed,
        },
      });
      res.json({ message: payload.reviewed ? "Feedback marked reviewed" : "Feedback marked unreviewed" });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to update review state" });
    }
  });

  app.post("/api/admin/feedback-inbox/review-bulk", requireAdmin, async (req, res) => {
    try {
      const payload = z.object({
        feedbackEventIds: z.array(z.string().min(1)).min(1).max(500),
        reviewed: z.boolean().default(true),
      }).parse(req.body || {});

      for (const feedbackEventId of payload.feedbackEventIds) {
        await appendSecurityEvent({
          eventType: "feedback_review_state_changed",
          actorUserId: req.user!.id,
          route: req.path,
          method: req.method,
          statusCode: 200,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
          payload: {
            feedbackEventId,
            reviewed: payload.reviewed,
          },
        });
      }

      res.json({
        message: payload.reviewed
          ? "Feedback items marked reviewed"
          : "Feedback items marked unreviewed",
        updated: payload.feedbackEventIds.length,
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to update bulk review state" });
    }
  });

  app.get("/api/admin/storage", requireAdmin, async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : req.user!.id;
      const [policy, usage] = await Promise.all([
        getStoragePolicy(userId),
        getStorageUsage(userId),
      ]);

      const toPercent = (value: number, max: number) => max > 0 ? Math.min(100, Number(((value / max) * 100).toFixed(2))) : 0;
      const warnings = {
        task: toPercent(usage.taskCount, policy.maxTasks),
        attachmentCount: toPercent(usage.attachmentCount, policy.maxAttachmentCount),
        attachmentBytes: toPercent(usage.attachmentBytes, policy.maxAttachmentBytes),
      };
      res.json({
        userId,
        policy,
        usage,
        warnings,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch storage usage" });
    }
  });

  app.post("/api/admin/usage/capture", requireAdmin, async (req, res) => {
    try {
      const userId = typeof req.body?.userId === "string" ? req.body.userId : req.user!.id;
      await captureUsageSnapshot(userId);
      res.status(201).json({ message: "Usage snapshot captured" });
    } catch (error) {
      res.status(500).json({ message: "Failed to capture usage snapshot" });
    }
  });

  app.get("/api/admin/usage", requireAdmin, async (_req, res) => {
    try {
      const usage = await getUsageOverview();
      res.json(usage);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch usage overview" });
    }
  });

  app.get("/api/admin/premium/retention", requireAdmin, async (req, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days || 30), 7), 180);
      const metrics = await getPremiumRetentionMetrics(days);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch premium retention metrics" });
    }
  });

  app.post("/api/admin/storage/retention-dry-run", requireAdmin, async (req, res) => {
    try {
      const retentionDays = Number(req.body?.retentionDays || 90);
      const result = await runRetentionDryRun(req.user!.id, retentionDays);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to run retention dry-run" });
    }
  });

  app.post("/api/admin/storage/attachment-retention-run", requireAdmin, async (req, res) => {
    try {
      const retentionDays = Number(req.body?.retentionDays || 90);
      const execute = Boolean(req.body?.execute);
      const result = await retentionSweepAttachments(req.user!.id, retentionDays, !execute);
      if (execute) {
        for (const candidate of result.candidates) {
          try {
            const metadata = candidate.metadataJson ? JSON.parse(candidate.metadataJson) : {};
            if (metadata?.storageKey) {
              await deleteAttachmentObject(String(metadata.storageKey));
            }
          } catch {
            // Continue sweep even if one object delete fails.
          }
        }
      }
      res.json({
        candidateCount: result.candidateCount,
        mode: execute ? "execute" : "dry-run",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to run attachment retention" });
    }
  });

  // ─── Data Migration (Admin) ────────────────────────────────────────────────

  app.post("/api/admin/export", requireAdmin, migrationLimiter, async (req, res) => {
    try {
      const { userId } = req.body;
      const bundle = userId
        ? await exportUserData(userId, { adminMode: true })
        : await exportFullDatabase();

      await logSecurityEvent(
        "data_export",
        req.user!.id,
        userId || undefined,
        req.ip,
        `${userId ? "User" : "Full"} database export (${Object.values(bundle.metadata.tableCounts).reduce((a, b) => a + b, 0)} records)`
      );

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="axtask-export-${userId ? "user-" + userId.slice(0, 8) : "full"}-${new Date().toISOString().slice(0, 10)}.json"`
      );
      res.json(bundle);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Export failed" });
    }
  });

  app.get("/api/admin/export/:userId", requireAdmin, migrationLimiter, async (req, res) => {
    try {
      const bundle = await exportUserData(req.params.userId, { adminMode: true });

      await logSecurityEvent(
        "data_export",
        req.user!.id,
        req.params.userId,
        req.ip,
        `User data export for ${req.params.userId.slice(0, 8)}... (${Object.values(bundle.metadata.tableCounts).reduce((a: number, b: number) => a + b, 0)} records)`
      );

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="axtask-user-${req.params.userId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`
      );
      res.json(bundle);
    } catch (error: any) {
      const msg = error.message || "Export failed";
      const status = msg.includes("not found") ? 404 : 500;
      res.status(status).json({ message: msg });
    }
  });

  app.post("/api/admin/import", requireAdmin, migrationLimiter, async (req, res) => {
    try {
      const { bundle, dryRun, mode } = req.body;
      if (!bundle || !bundle.metadata || !bundle.data) {
        return res.status(400).json({ message: "Invalid export bundle format" });
      }

      const importMode = mode === "remap" ? "remap" : "preserve";

      if (!dryRun) {
        const preCheck = await validateBundleWithDb(bundle);
        if (preCheck.errors.length > 0) {
          return res.json({
            success: false,
            dryRun: false,
            mode: importMode,
            inserted: {},
            skipped: {},
            conflicts: preCheck.conflicts,
            errors: preCheck.errors,
            warnings: preCheck.warnings,
          });
        }
      }

      const result = await importBundle(bundle, { dryRun: !!dryRun, mode: importMode });

      if (!dryRun && result.success) {
        const totalInserted = Object.values(result.inserted).reduce((a, b) => a + b, 0);
        await logSecurityEvent(
          "data_import",
          req.user!.id,
          undefined,
          req.ip,
          `Database import (${importMode}): ${totalInserted} records inserted, ${result.errors.length} errors`
        );
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Import failed" });
    }
  });

  app.post("/api/admin/import/validate", requireAdmin, migrationLimiter, async (req, res) => {
    try {
      const { bundle } = req.body;
      if (!bundle || !bundle.metadata || !bundle.data) {
        return res.status(400).json({ message: "Invalid export bundle format" });
      }
      const validation = await validateBundleWithDb(bundle);
      res.json(validation);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Validation failed" });
    }
  });

  // ─── User Self-Service Export & Import (GDPR) ──────────────────────────────

  app.get("/api/account/export", requireAuth, migrationLimiter, async (req, res) => {
    try {
      const bundle = await exportUserData(req.user!.id);
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="my-axtask-data-${new Date().toISOString().slice(0, 10)}.json"`
      );
      res.json(bundle);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Export failed" });
    }
  });

  app.post("/api/account/import", requireAuth, migrationLimiter, async (req, res) => {
    try {
      const { bundle, dryRun } = req.body;
      if (!bundle || !bundle.metadata || !bundle.data) {
        return res.status(400).json({ message: "Invalid export bundle format" });
      }

      if (bundle.metadata.exportMode !== "user") {
        return res.status(400).json({ message: "Only user-level export bundles can be imported via self-service. Full database imports require admin access." });
      }

      const validation = validateBundle(bundle);
      if (validation.errors.length > 0) {
        return res.status(400).json({ message: "Bundle validation failed", errors: validation.errors });
      }

      const result = await importUserBundle(bundle, req.user!.id, { dryRun: !!dryRun });

      if (!dryRun && result.success) {
        const totalInserted = Object.values(result.inserted).reduce((a, b) => a + b, 0);
        await logSecurityEvent(
          "user_data_import",
          req.user!.id,
          undefined,
          req.ip,
          `User self-service import: ${totalInserted} records imported`
        );
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Import failed" });
    }
  });

  // ─── Collaboration routes ──────────────────────────────────────────────────

  app.get("/api/tasks/shared", requireAuth, async (req, res) => {
    try {
      const shared = await getSharedTasks(req.user!.id);
      res.json(shared);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch shared tasks" });
    }
  });

  app.get("/api/tasks/:id/collaborators", requireAuth, async (req, res) => {
    try {
      const access = await canAccessTask(req.user!.id, req.params.id);
      if (!access.canAccess) return res.status(403).json({ message: "Access denied" });
      const collaborators = await getTaskCollaborators(req.params.id);
      res.json(collaborators);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch collaborators" });
    }
  });

  app.post("/api/tasks/:id/collaborators", requireAuth, async (req, res) => {
    try {
      const ownerCheck = await isTaskOwner(req.user!.id, req.params.id);
      if (!ownerCheck) return res.status(403).json({ message: "Only task owner can add collaborators" });
      const { email, role } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const validRoles = ["editor", "viewer"];
      if (role && !validRoles.includes(role)) return res.status(400).json({ message: "Invalid role" });
      const user = await getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.id === req.user!.id) return res.status(400).json({ message: "Cannot add yourself" });
      const collab = await addCollaborator(req.params.id, user.id, role || "editor", req.user!.id);
      res.json(collab);
    } catch (error) {
      res.status(500).json({ message: "Failed to add collaborator" });
    }
  });

  app.put("/api/tasks/:id/collaborators/:userId", requireAuth, async (req, res) => {
    try {
      const ownerCheck = await isTaskOwner(req.user!.id, req.params.id);
      if (!ownerCheck) return res.status(403).json({ message: "Only task owner can change roles" });
      const { role } = req.body;
      const validRoles = ["editor", "viewer"];
      if (!validRoles.includes(role)) return res.status(400).json({ message: "Invalid role" });
      const updated = await updateCollaboratorRole(req.params.id, req.params.userId, role);
      if (!updated) return res.status(404).json({ message: "Collaborator not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update collaborator" });
    }
  });

  app.delete("/api/tasks/:id/collaborators/:userId", requireAuth, async (req, res) => {
    try {
      const ownerCheck = await isTaskOwner(req.user!.id, req.params.id);
      const isSelf = req.params.userId === req.user!.id;
      if (!ownerCheck && !isSelf) return res.status(403).json({ message: "Access denied" });
      const removed = await removeCollaborator(req.params.id, req.params.userId);
      if (!removed) return res.status(404).json({ message: "Collaborator not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove collaborator" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
