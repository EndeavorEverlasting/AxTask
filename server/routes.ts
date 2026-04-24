import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { timingSafeEqual, randomUUID } from "crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import rateLimit from "express-rate-limit";
import passport from "passport";
import multer from "multer";
import { attachShoppingListRoutes } from "./shopping-lists-routes";
import { listPurchasedShoppingEventsForUser } from "./shopping-lists-storage";
import { exportFullDatabase, exportUserData } from "./migration/export";
import { importBundle, importUserBundle, validateBundle, validateBundleWithDb } from "./migration/import";
import {
  storage, createUser, getUserByEmail, getUserByPublicHandle, recordFailedLogin, resetFailedLogins,
  createResetToken, verifyResetToken, consumeResetToken,
  setSecurityQuestion, getSecurityQuestion, verifySecurityAnswer,
  adminResetPassword,
  banUser, unbanUser, getAllUsers, isUserBanned,
  logSecurityEvent, getSecurityLogs,
  getOrCreateWallet, getTransactions, getUserBadges, getRewardsCatalog, getRewardById, getUserRewards, redeemReward, sellBackUserReward, ownerGrantCoinsToUser, seedRewardsCatalog,
  spendCoins,
  getMaxAvatarLevel,
  getClassificationThumbState,
  awardClassificationThumbUp,
  listUserAlarmSnapshots,
  createUserAlarmSnapshot,
  getUserAlarmSnapshot,
  listCollaborationInbox,
  appendCollaborationMessage,
  markCollaborationMessageRead,
  listUserLocationPlaces,
  upsertUserLocationPlace,
  getCommunityMomentumStats,
  getOfflineGeneratorStatus, buyOfflineGenerator, upgradeOfflineGenerator, getOfflineSkillTree, unlockOfflineSkill, claimOfflineGeneratorCoins, seedOfflineSkillTree,
  getFeedbackSubmissionCount, getAvatarProfiles, engageAvatarMission, spendCoinsForAvatarBoost, seedAvatarSkillTree, getAvatarSkillTree, unlockAvatarSkill,
  userHasAvatarSkillUnlocked,
  assertCanCreateTasks, assertCanStoreAttachment, createAttachmentAsset, getAttachmentAssets, getAttachmentAssetById, markAttachmentAssetUploaded, softDeleteAttachmentAsset, retentionSweepAttachments, getStoragePolicy, getStorageUsage, getTaskAttachments, getTaskAttachmentIdsForTasks, linkAttachmentToTask,
  linkAttachmentsToOwner, getAttachmentsForOwner, getAttachmentsForOwnerPublic,
  getAttachmentsForOwnersBatch, getAttachmentsForOwnersPublicBatch,
  hasImportFingerprint, recordImportFingerprint, createInvoice, issueInvoice, confirmInvoicePayment, listInvoices, listInvoiceEvents,
  createMfaChallenge, verifyMfaChallenge, verifyMfaChallengeWithMetadata, ensureIdempotencyKey,
  listBillingPaymentMethodsForUser, createBillingPaymentMethod,
  deleteMfaChallengeById, getUserContactForMfa, setUserVerifiedPhone, getUserById,
  getUserRowById, updateUserAccountProfile, setUserTotpSecret, clearUserTotp, verifyPassword,
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
  getUserVoicePreference,
  upsertUserVoicePreference,
  getUserCalendarPreference,
  upsertUserCalendarPreference,
  listUserPushSubscriptions,
  upsertUserPushSubscription,
  deleteUserPushSubscription,
  listOpenAdherenceInterventions,
  createAdherenceIntervention,
  acknowledgeAdherenceIntervention,
  listStudyDecks,
  createStudyDeck,
  listStudyCards,
  createStudyCard,
  startStudySession,
  submitStudyAnswer,
  getStudySessionSummary,
  getStudyStats,
  listCommunityPosts,
  getCommunityPostWithReplies,
  createCommunityReply,
  seedCommunityPosts,
  addCoins,
  hasTaskBeenAwarded,
  listUserClassificationLabels,
  addUserClassificationLabel,
  addCollaborator,
  removeCollaborator,
  getTaskCollaborators,
  updateCollaboratorRole,
  getSharedTasks,
  getAccessibleTasksForUser,
  getAccessibleTaskForUser,
  updateTaskById,
  getInvitePreviewByPublicHandle,
  searchPublicInvitePreviewsByPrefix,
  getRecentInviteCollaboratorPreviews,
  canAccessTask,
  isTaskOwner,
  resetStreak,
  getPatterns,
  getPatternsByType,
  getUserClassificationStats,
  createDispute,
  getUserDispute,
  getDisputeById,
  getDisputesForTask,
  getDisputesByCategory,
  getVoteTallyForDispute,
  getUserVoteOnDispute,
  voteOnDispute,
  updateCategoryReviewTracker,
  getCategoryReviewTriggers,
  getCategoryReviewTriggerById,
  resolveCategoryReview,
  listArchetypePollsForPublic,
  getArchetypePollById,
  listArchetypePollOptions,
  getArchetypePollKAnonTalliesForPublic,
  recordArchetypePollVoteWithWeeklyReward,
  getArchetypePollVoteForUser,
  getDominantArchetypeKeyForUser,
  createArchetypePollWithOptions,
} from "./storage";
import { awardCoinsForCompletion, awardFeedbackBadges, BADGE_DEFINITIONS, processChipHuntSync } from "./coin-engine";
import { countCoinEventsToday, tryCappedCoinAward, ENGAGEMENT } from "./engagement-rewards";
import { DENDRITIC_SHOPPING_LIST_SKILL_KEY } from "@shared/shopping-list-feature";
import { awardLoginRewards } from "./login-rewards";
import {
  awardOrganizationInteractionSignal,
  getOrganizationAptitudeTrends,
  maybeAwardOrganizationFollowthrough,
  recordTaskFilterIntent,
} from "./organization-rewards";
import { ATTACHMENT_IMAGE_MAX_BYTES, ATTACHMENT_UPLOAD_RAW_BODY_LIMIT } from "@shared/attachment-image-limits";
import { completionCoinSkipReason } from "@shared/completion-coin-skip";
import { awardCoinsForClassification } from "./classification-engine";
import { z } from "zod";
import { insertTaskSchema, updateTaskSchema, reorderTasksSchema, registerSchema, loginSchema, createPremiumSavedViewSchema, createPremiumReviewWorkflowSchema, updateNotificationPreferenceSchema, updateVoicePreferenceSchema, updateCalendarPreferenceSchema, createPushSubscriptionSchema, deletePushSubscriptionSchema, createStudyDeckSchema, createStudyCardSchema, startStudySessionSchema, submitStudyAnswerSchema, classificationAssociationsSchema, acknowledgeAdherenceInterventionSchema, feedbackAvatarKeySchema, archetypeRollupDaily, archetypeMarkovDaily, TASK_NOTES_MAX_CHARS, type UpdateTask, type Task, type ClassificationAssociation, tasks, coinTransactions, taskClassificationConfirmations } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, count, gte, lte } from "drizzle-orm";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { maskE164ForDisplay, normalizeToE164 } from "@shared/phone";
import {
  toPublicSessionUser,
  toPublicWallet,
  toPublicCoinTransactions,
  toPublicBadges,
  toPublicBadgeDefinitions,
  toPublicAttachmentRefs,
  toPublicTaskListItems,
  toPublicTaskDetail,
  toPublicInviteUserPreview,
  toPublicArchetypePollSummary,
  toPublicArchetypePollOptions,
  type PublicDmConversation,
  type PublicDmMessage,
  type PublicArchetypePollResultRow,
} from "@shared/public-client-dtos";
import { deliverMfaOtp, canDeliverMfaInProduction } from "./services/otp-delivery";
import { verifyMfaChallengeOrTotp } from "./services/mfa-totp";
import {
  buildUserExportBundle,
  buildImportChallenge,
  runAccountImport,
} from "./account-backup";
import {
  buildTotpKeyUri,
  encryptTotpSecretBase32,
  generateTotpSecretBase32,
  verifyUserTotpFromCiphertext,
  verifyTotpCode,
} from "./services/totp";
import { PriorityEngine } from "../client/src/lib/priority-engine";
import { dispatchVoiceCommand } from "./engines/dispatcher";
import { applyVoiceCompanionRewards } from "./voice-companion-rewards";
import { processPlannerQuery } from "./engines/planner-engine";
import { processFeedbackWithEngines } from "./engines/feedback-engine";
import { recordArchetypeSignal, type ArchetypeSignalKind } from "./lib/archetype-signal";
import { getPublicArchetypeContinuumForUser } from "./lib/archetype-continuum";
import { hashActor } from "./lib/actor-hash";
import { insertClassificationDisputeSchema, CATEGORY_REVIEW_STATUSES, type CategoryReviewStatus } from "@shared/schema";
import { processTaskReview, type ReviewAction } from "./engines/review-engine";
import {
  analyzeTaskHistory,
  suggestDeadline,
  getInsights,
  learnFromTask,
  inferGroceryRepurchaseSuggestions,
} from "./engines/pattern-engine";
import { createGoogleSheetsAPI, type GoogleSheetsCredentials } from "./google-sheets-api";
import { generateChecklistPDF } from "./checklist-pdf";
import { getProductivityExportPricesForUser, priceForKind } from "./productivity-export-pricing";
import { buildTasksSpreadsheetBuffer, generateTaskReportPdf, buildTaskReportXlsxBuffer } from "./task-export-generators";
import {
  filterShoppingTasks,
  buildShoppingListHtmlDocument,
  buildShoppingListSpreadsheetBuffer,
  generateShoppingListPdf,
} from "./shopping-list-export-generators";
import { processChecklistImage } from "./ocr-processor";
import { requireAuth } from "./auth";
import { getProvider, getAvailableProviders } from "./auth-providers";
import { captureUsageSnapshot, getUsageOverview, runRetentionDryRun } from "./services/usage-service";
import { getApiPerformanceHeuristics } from "./services/api-performance-service";
import { getDbSizeCached } from "./services/db-size";
import {
  listTableBytes,
  listDomainRollup,
  listTopUsers,
  type TopUserKind,
} from "./services/db-storage";
import { listDbSizeHistory } from "./workers/db-size-snapshot";
import {
  previewRetentionPrune,
  runRetentionPruneOnce,
} from "./workers/retention-prune";
import { createUploadToken, verifyUploadToken } from "./services/upload-token";
import { writeAttachmentObject, readAttachmentObject, deleteAttachmentObject } from "./services/attachment-storage";
import { scanAttachmentBuffer } from "./services/attachment-scan";
import { fetchImageByUrl, UrlFetchError } from "./services/attachment-url-fetch";
import {
  searchGifs,
  hasAnyGifProvider,
  GifSearchConfigError,
  type GifSearchProvider,
} from "./services/gif-search";
import { classifyWithFallback, classifyWithAssociations, normalizeAssociationWeights } from "./services/classification/universal-classifier";
import { callNodeWeaverBatchClassify } from "./services/classification/nodeweaver-client";
import { confirmTaskClassificationForUser, getClassificationConfirmPayload } from "./classification-confirm";
import { getNotificationDispatchProfile } from "./services/notification-intensity";
import { loadMergedPublicHolidays } from "./services/calendar/public-holidays";
import { BUILT_IN_CLASSIFICATIONS } from "@shared/classification-catalog";
import { isShoppingTask } from "@shared/shopping-tasks";
import { notifyAdminsOfApiError } from "./monitoring/admin-alerts";
import { evaluateAdherenceForUser } from "./services/adherence-evaluator";
import {
  assertEligibleForPublicParticipation,
  PublicParticipationAgeError,
} from "./lib/public-participation-age";
import {
  upsertUserDeviceKey,
  listUserDeviceKeysPublic,
  createDirectDmConversation,
  assertDmMember,
  listDmConversationsForUser,
  insertDmMessage,
  listDmMessages,
  getOtherMemberUserId,
  getPublicDmSharePack,
  resolvePeerUserIdByPublicIdentifier,
} from "./dm-e2ee";

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

import { computeTaskFingerprint } from "./task-fingerprint";
import { moderateText, rejectMediaContent, sanitizeForDisplay } from "./services/content-moderation";
import { generateOrbDialogue, getOrbReply, getOrbVoice, ensureOrbActivityLevel, listAvatarVoiceOpeners } from "./engines/dialogue-engine";
import { ensureArchetypePollSchedule } from "./engines/archetype-poll-engine";

function getUploadSigningSecret(): string {
  return process.env.ATTACHMENT_UPLOAD_SECRET || process.env.SESSION_SECRET || "dev-upload-secret";
}

function buildAttachmentStorageKey(userId: string, assetId: string, fileName?: string): string {
  const safeName = (fileName || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
  const datePart = new Date().toISOString().slice(0, 10);
  return `${userId}/${datePart}/${assetId}-${safeName}`;
}

async function classifyTaskWithFallback(activity: string, notes: string, preferExternal = true): Promise<string> {
  const { result } = await classifyWithAssociations(activity, notes, { preferExternal });
  return result.classification;
}

function hasFeature(entitlements: { features: string[] }, feature: string): boolean {
  return entitlements.features.includes(feature);
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
  aiCost7dCents?: number;
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
    {
      key: "ai_cost_7d",
      label: "AI cost (7d)",
      value: Number((((metrics.aiCost7dCents || 0) / 100)).toFixed(2)),
      unit: "USD",
      tone: (metrics.aiCost7dCents || 0) > 500 ? "warning" : "neutral",
    },
  ];
}

const AI_ROUTE_COST_CENTS: Record<string, number> = {
  "/api/classification/suggestions": 2,
  "/api/classification/classify": 2,
  "/api/planner/ask": 1,
  "/api/voice/process": 1,
  "/api/tasks/review": 1,
};

const aiRuntimeFlags = {
  externalClassifierEnabled: process.env.AI_EXTERNAL_CLASSIFIER_ENABLED !== "false",
};

async function trackAiRequestEvent(input: {
  actorUserId: string;
  route: string;
  method: string;
  statusCode: number;
  source: string;
  confidence?: number;
  fallbackLayer?: number;
  disabledExternalClassifier: boolean;
}) {
  const estimatedCostCents = AI_ROUTE_COST_CENTS[input.route] || 0;
  await appendSecurityEvent({
    eventType: "ai_request",
    actorUserId: input.actorUserId,
    route: input.route,
    method: input.method,
    statusCode: input.statusCode,
    payload: {
      source: input.source,
      confidence: input.confidence ?? null,
      fallbackLayer: input.fallbackLayer ?? null,
      estimatedCostCents,
      disabledExternalClassifier: input.disabledExternalClassifier,
    },
  });
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

// Admin "Run prune now" is a destructive action that chews through all
// retention tables. Step-up auth + role check already apply, but cap the
// mutation specifically — burst-clicking the button shouldn't queue up
// concurrent sweeps.
const adminRetentionRunLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Retention prune already in flight — try again shortly" },
});

const migrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many migration requests — try again later" },
});

/**
 * Paste-composer upload budget. Each pasted image/GIF consumes one slot on
 * /api/attachments/upload-url plus one on /api/attachments/upload/:token.
 * Budget assumes an enthusiastic chat-style poster: ~40 pastes every 15 min.
 */
const attachmentUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many attachment uploads — slow down a moment" },
});

/**
 * GIF search/resolve quota - prevents accidental runaway calls to Giphy /
 * Tenor if a picker is held open.
 */
const gifSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many GIF searches — pause and try again" },
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
        const ctx = req.monitor;
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
            requestId: ctx?.requestId,
            params: ctx?.params,
            query: ctx?.query,
            body: ctx?.body,
            headers: ctx?.headers,
          },
        });

        // Fallback: ensure we record a dedicated error event for 5xx even if the route handler
        // caught the error and returned 500 without throwing into the global error handler.
        if (res.statusCode >= 500 && !(req as any).__axtaskApiErrorEmitted) {
          const errorName = "Http5xx";
          const errorMessage = `Response status ${res.statusCode}`;
          await appendSecurityEvent({
            eventType: "api_error",
            actorUserId,
            route: req.path,
            method: req.method,
            statusCode: res.statusCode,
            ipAddress,
            userAgent,
            payload: {
              requestId: ctx?.requestId,
              params: ctx?.params,
              query: ctx?.query,
              body: ctx?.body,
              headers: ctx?.headers,
              errorName,
              errorMessage,
            },
          });
          void notifyAdminsOfApiError({
            requestId: ctx?.requestId,
            route: req.path,
            method: req.method,
            statusCode: res.statusCode,
            errorName,
            errorMessage,
          });
        }
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
      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Registration succeeded but login failed" });
        void awardLoginRewards(user.id);
        res.status(201).json(toPublicSessionUser(user));
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
    void evaluateAdherenceForUser(req.user!.id, "login");
    res.json(toPublicSessionUser(fresh));
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
      if (process.env.NODE_ENV !== "production") {
        console.log(`[PASSWORD RESET] (non-production) ${email}: ${resetUrl}`);
      }
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

  // Premium subscription self-service is blocked while payment integration is in development.
  const PREMIUM_DEV_MSG = "Premium features are in development. Payment integration coming soon.";

  app.post("/api/premium/subscriptions/activate", requireAuth, (_req, res) => {
    res.status(403).json({ message: PREMIUM_DEV_MSG });
  });

  app.post("/api/premium/subscriptions/downgrade", requireAuth, (_req, res) => {
    res.status(403).json({ message: PREMIUM_DEV_MSG });
  });

  app.post("/api/premium/subscriptions/reactivate", requireAuth, (_req, res) => {
    res.status(403).json({ message: PREMIUM_DEV_MSG });
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
      const dispatchProfile = getNotificationDispatchProfile(preference.intensity);
      const subscriptions = await listUserPushSubscriptions(req.user!.id);
      const pushConfigured = Boolean(
        (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || "").trim(),
      );
      const hasSubscription = subscriptions.length > 0;
      const deliveryChannel =
        preference.enabled && pushConfigured && hasSubscription ? "push" : "in_app";
      res.json({
        ...preference,
        dispatchProfile,
        pushConfigured,
        hasSubscription,
        deliveryChannel,
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
        groceryReminderEnabled: payload.groceryReminderEnabled,
        groceryAutoCreateTaskEnabled: payload.groceryAutoCreateTaskEnabled,
        groceryAutoNotifyEnabled: payload.groceryAutoNotifyEnabled,
        quietHoursStart: payload.quietHoursStart,
        quietHoursEnd: payload.quietHoursEnd,
        feedbackNudgePrefs: payload.feedbackNudgePrefs,
      });
      const dispatchProfile = getNotificationDispatchProfile(preference.intensity);
      const subscriptions = await listUserPushSubscriptions(req.user!.id);
      const pushConfigured = Boolean(
        (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || "").trim(),
      );
      const hasSubscription = subscriptions.length > 0;
      const deliveryChannel =
        preference.enabled && pushConfigured && hasSubscription ? "push" : "in_app";
      return res.json({
        ...preference,
        dispatchProfile,
        pushConfigured,
        hasSubscription,
        deliveryChannel,
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      return res.status(500).json({ message: "Failed to update notification preferences" });
    }
  });

  app.get("/api/notifications/push-public-config", requireAuth, async (_req, res) => {
    const publicKey = (
      process.env.VAPID_PUBLIC_KEY ||
      process.env.VITE_VAPID_PUBLIC_KEY ||
      ""
    ).trim();
    res.json({
      configured: !!publicKey,
      publicKey: publicKey || undefined,
    });
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

  app.get("/api/adherence/interventions", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const rows = await listOpenAdherenceInterventions(req.user!.id, limit);
      const items = rows.map((row) => ({
        ...row,
        context: row.contextJson ? (() => {
          try {
            return JSON.parse(row.contextJson);
          } catch {
            return null;
          }
        })() : null,
      }));
      res.json(items);
    } catch {
      res.status(500).json({ message: "Failed to fetch adherence interventions" });
    }
  });

  app.post("/api/adherence/interventions/:id/acknowledge", requireAuth, async (req, res) => {
    try {
      const { action } = acknowledgeAdherenceInterventionSchema.parse(req.body || {});
      const ok = await acknowledgeAdherenceIntervention(req.user!.id, req.params.id, action);
      if (!ok) return res.status(404).json({ message: "Intervention not found" });
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to acknowledge intervention" });
    }
  });

  app.post("/api/adherence/refresh", requireAuth, async (req, res) => {
    try {
      const result = await evaluateAdherenceForUser(req.user!.id, "manual");
      res.json(result);
    } catch {
      res.status(500).json({ message: "Failed to refresh adherence evaluation" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Community public feed (no auth required)
  // ════════════════════════════════════════════════════════════════════════

  app.get("/api/public/community/tasks", apiLimiter, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      let rows = await db
        .select({
          id: tasks.id,
          activity: tasks.activity,
          date: tasks.date,
          time: tasks.time,
          status: tasks.status,
          priority: tasks.priority,
          classification: tasks.classification,
          notes: tasks.notes,
          communityShowNotes: tasks.communityShowNotes,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .where(eq(tasks.visibility, "public"))
        .orderBy(desc(tasks.updatedAt), desc(tasks.createdAt))
        .limit(limit + 1);

      // Cursor-based pagination support
      const cursorAt = req.query.cursorAt as string | undefined;
      const cursorId = req.query.cursorId as string | undefined;
      if (cursorAt && cursorId) {
        const cursorDate = new Date(cursorAt);
        rows = rows.filter((r) => {
          const rDate = r.updatedAt ?? r.createdAt ?? new Date(0);
          if (rDate < cursorDate) return true;
          if (rDate.getTime() === cursorDate.getTime() && r.id < cursorId) return true;
          return false;
        });
      }

      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];

      const mapped = page.map((t) => ({
        id: t.id,
        activity: t.activity,
        date: t.date,
        time: t.time,
        status: t.status,
        priority: t.priority,
        classification: t.classification,
        notes: t.communityShowNotes ? (t.notes || undefined) : undefined,
      }));

      const nextCursor = hasMore && last
        ? {
            publishedAt: (last.updatedAt ?? last.createdAt ?? new Date()).toISOString(),
            id: last.id,
            createdAt: (last.createdAt ?? new Date()).toISOString(),
          }
        : null;

      res.json({ tasks: mapped, nextCursor });
    } catch (error) {
      console.error("Community feed error:", error);
      res.status(500).json({ message: "Failed to fetch community tasks" });
    }
  });

  // Seed avatar community posts on startup, then ensure orb dialogue activity
  try {
    await seedCommunityPosts();
    ensureOrbActivityLevel(8).then((n) => {
      if (n > 0) console.log(`[dialogue-engine] Generated ${n} new orb dialogue threads`);
    }).catch((err) => console.error("[dialogue-engine] startup error:", err));
    if (process.env.AXTASK_ARCHETYPE_POLL_SCHEDULER !== "0") {
      ensureArchetypePollSchedule().then((n) => {
        if (n > 0) console.log(`[archetype-poll-engine] Created ${n} poll window`);
      }).catch((err) => console.error("[archetype-poll-engine] startup error:", err));
    }
  } catch (err) {
    console.error("[community-seed] Non-fatal: failed to seed community posts —", (err as Error).message);
  }

  // Community avatar forum — list posts
  app.get("/api/public/community/posts", apiLimiter, async (_req, res) => {
    try {
      const posts = await listCommunityPosts(50);
      res.json({ posts });
    } catch (error) {
      console.error("Community posts error:", error);
      res.status(500).json({ message: "Failed to fetch community posts" });
    }
  });

  /** Privacy-safe aggregate activity (counts only, last 24h). */
  app.get("/api/public/community/momentum", apiLimiter, async (_req, res) => {
    try {
      const stats = await getCommunityMomentumStats();
      res.json(stats);
    } catch (error) {
      console.error("Community momentum error:", error);
      res.status(500).json({ message: "Failed to fetch community momentum" });
    }
  });

  app.get("/api/public/community/polls", apiLimiter, async (_req, res) => {
    try {
      const now = new Date();
      const rows = await listArchetypePollsForPublic(now, 30);
      const polls = rows.map((p) => toPublicArchetypePollSummary(p, now));
      res.json({ polls });
    } catch (error) {
      console.error("Archetype polls list error:", error);
      res.status(500).json({ message: "Failed to fetch polls" });
    }
  });

  app.get("/api/public/community/polls/:id", apiLimiter, async (req, res) => {
    try {
      const now = new Date();
      const poll = await getArchetypePollById(req.params.id);
      if (!poll) return res.status(404).json({ message: "Poll not found" });
      if (poll.opensAt > now) return res.status(404).json({ message: "Poll not found" });
      const options = await listArchetypePollOptions(poll.id);
      const summary = toPublicArchetypePollSummary(poll, now);
      let results: PublicArchetypePollResultRow[] | null = null;
      if (summary.resultsAvailable) {
        const tallies = await getArchetypePollKAnonTalliesForPublic(poll.id);
        results = tallies.map((t) => ({
          optionId: t.optionId,
          label: t.label,
          sortOrder: t.sortOrder,
          totalCount: t.totalCount,
          byArchetype: t.byArchetype,
        }));
      }
      res.json({
        poll: {
          ...summary,
          options: toPublicArchetypePollOptions(options),
          results,
        },
      });
    } catch (error) {
      console.error("Archetype poll detail error:", error);
      res.status(500).json({ message: "Failed to fetch poll" });
    }
  });

  app.get("/api/public/community/polls/:id/my-vote", requireAuth, apiLimiter, async (req, res) => {
    try {
      const vote = await getArchetypePollVoteForUser(req.params.id, req.user!.id);
      res.json({ optionId: vote?.optionId ?? null });
    } catch (error) {
      console.error("Archetype poll my-vote error:", error);
      res.status(500).json({ message: "Failed to fetch vote" });
    }
  });

  const archetypePollVoteBodySchema = z.object({
    optionId: z.string().min(1),
  });

  app.post("/api/public/community/polls/:id/vote", requireAuth, apiLimiter, async (req, res) => {
    try {
      const now = new Date();
      const poll = await getArchetypePollById(req.params.id);
      if (!poll) return res.status(404).json({ message: "Poll not found" });
      if (poll.opensAt > now) return res.status(400).json({ message: "Poll is not open yet" });
      if (now >= poll.closesAt) return res.status(400).json({ message: "Poll is closed" });

      const body = archetypePollVoteBodySchema.parse(req.body);
      const options = await listArchetypePollOptions(poll.id);
      if (!options.some((o) => o.id === body.optionId)) {
        return res.status(400).json({ message: "Invalid option" });
      }

      const archetypeKey = await getDominantArchetypeKeyForUser(req.user!.id);
      const apv = ENGAGEMENT.archetypePollVote;
      const { pollVoteReward, pollVoteRewardNote, isNewVote } =
        await recordArchetypePollVoteWithWeeklyReward({
          userId: req.user!.id,
          pollId: poll.id,
          optionId: body.optionId,
          archetypeKey,
          rewardAmount: apv.amount,
          weeklyCap: apv.weeklyCap,
          rewardReason: apv.reason,
          rewardDetails: "Community archetype poll vote",
        });

      try {
        await appendSecurityEvent({
          eventType: "archetype_poll_vote",
          route: req.path,
          method: "POST",
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
          payload: {
            pollId: poll.id,
            optionId: body.optionId,
            archetypeKey,
            hashedActor: hashActor(req.user!.id),
          },
        });
      } catch {
        /* non-fatal security event */
      }

      res.status(200).json({
        optionId: body.optionId,
        pollVoteReward,
        pollVoteRewardNote,
        isNewVote,
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to record vote" });
    }
  });

  // Community avatar forum — single post with replies
  app.get("/api/public/community/posts/:id", apiLimiter, async (req, res) => {
    try {
      const result = await getCommunityPostWithReplies(req.params.id);
      if (!result) return res.status(404).json({ message: "Post not found" });
      // Single batched fetch for post + every reply's attachments. Previously
      // each reply triggered its own query (N+1). See Phase E of the
      // perf/refactor sweep.
      const replyList = (result.replies || []) as Array<{ id: string; [k: string]: unknown }>;
      const [postAssets, replyAssetsMap] = await Promise.all([
        getAttachmentsForOwnerPublic({
          ownerType: "community_post",
          ownerId: result.post.id,
        }),
        getAttachmentsForOwnersPublicBatch({
          ownerType: "community_reply",
          ownerIds: replyList.map((r) => r.id),
        }),
      ]);
      const replies = replyList.map((reply) => ({
        ...reply,
        attachments: toPublicAttachmentRefs(replyAssetsMap.get(reply.id) ?? []),
      }));
      res.json({
        post: { ...result.post, attachments: toPublicAttachmentRefs(postAssets) },
        replies,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch post" });
    }
  });

  // Community avatar forum — reply to a post (auth required)
  const communityReplySchema = z.object({
    body: z.string().min(1).max(2000),
    attachmentAssetIds: z.array(z.string().min(1)).max(8).default([]),
  });

  const guardPublicParticipationAge = async (req: Request, res: Response): Promise<boolean> => {
    const row = await getUserRowById(req.user!.id);
    try {
      assertEligibleForPublicParticipation(row?.birthDate ?? null);
      return true;
    } catch (e: unknown) {
      if (e instanceof PublicParticipationAgeError) {
        res.status(e.statusCode).json({ message: e.message, code: e.code });
        return false;
      }
      throw e;
    }
  };

  app.post("/api/public/community/posts/:id/reply", requireAuth, apiLimiter, async (req, res) => {
    try {
      if (!(await guardPublicParticipationAge(req, res))) return;

      // ── Media rejection ──
      const mediaCheck = rejectMediaContent(req.headers["content-type"]);
      if (!mediaCheck.allowed) return res.status(415).json({ message: mediaCheck.reason });

      const payload = communityReplySchema.parse(req.body);

      // ── Content moderation ──
      const sanitized = sanitizeForDisplay(payload.body);
      const modResult = moderateText(sanitized);
      if (!modResult.allowed) {
        return res.status(422).json({ message: modResult.reason });
      }

      const postData = await getCommunityPostWithReplies(req.params.id);
      if (!postData) return res.status(404).json({ message: "Post not found" });

      const displayName = req.user!.displayName || req.user!.email?.split("@")[0] || "Community Member";
      const reply = await createCommunityReply({
        postId: req.params.id,
        userId: req.user!.id,
        displayName,
        body: sanitized,
      });
      const replyAssets = await linkAttachmentsToOwner({
        userId: req.user!.id,
        ownerType: "community_reply",
        ownerId: reply.id,
        assetIds: payload.attachmentAssetIds,
      });

      // ── Orb auto-reply using the dialogue engine (~50% chance) ──
      const avatarKeys = ["mood", "archetype", "productivity", "social", "lazy"] as const;
      if (Math.random() > 0.5) {
        const pick = avatarKeys[Math.floor(Math.random() * avatarKeys.length)];
        const voice = getOrbVoice(pick);
        await createCommunityReply({
          postId: req.params.id,
          avatarKey: pick,
          displayName: voice?.name || "Orb",
          body: getOrbReply(pick),
        });
      }

      res.status(201).json({ ...reply, attachments: toPublicAttachmentRefs(replyAssets) });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to post reply" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Task routes (protected — require login)
  // ════════════════════════════════════════════════════════════════════════

  app.use("/api/tasks", apiLimiter);

  app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
      /* Slim DTO: drops `userId` (privacy, per CLIENT_VISIBLE_PRIVACY.md)
       * and replaces the `classificationAssociations` jsonb array with a
       * single `classificationExtraCount` integer (bandwidth — the list
       * view only renders a "+N" pill, the classify dialog lazy-fetches
       * the full associations via GET /api/tasks/:id). */
      const userId = req.user!.id;
      const accessible = await getAccessibleTasksForUser(userId);
      const rows = accessible.map((entry) => entry.task);
      const byTask = await getTaskAttachmentIdsForTasks(userId, rows.map((r) => r.id));
      const publicRows = toPublicTaskListItems(rows, byTask);
      res.json(
        publicRows.map((row, idx) => ({
          ...row,
          viewerRole: accessible[idx]?.viewerRole ?? "owner",
        })),
      );
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

  const tasksSpreadsheetExportSchema = z.object({
    format: z.enum(["csv", "xlsx"]),
  });

  app.post("/api/tasks/export/spreadsheet", requireAuth, async (req, res) => {
    try {
      const parsed = tasksSpreadsheetExportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "format must be csv or xlsx" });
      }
      const userId = req.user!.id;
      const prices = await getProductivityExportPricesForUser(userId);
      const required = priceForKind(prices, "tasksSpreadsheet");
      if (!prices.freeInDev && required > 0) {
        const w = await spendCoins(userId, required, "productivity_export:tasks_spreadsheet");
        if (!w) {
          const bal = await getOrCreateWallet(userId);
          return res.status(402).json({
            code: "INSUFFICIENT_COINS",
            required,
            balance: bal.balance,
            message: "Not enough AxCoins for this export.",
          });
        }
      }
      const tasks = await storage.getTasks(userId);
      const buf = buildTasksSpreadsheetBuffer(tasks, parsed.data.format);
      const day = new Date().toISOString().split("T")[0];
      const ext = parsed.data.format === "csv" ? "csv" : "xlsx";
      const mime =
        parsed.data.format === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `attachment; filename="axtask-tasks-${day}.${ext}"`);
      res.send(buf);
    } catch (error) {
      res.status(500).json({ message: "Failed to export tasks" });
    }
  });

  const taskReportBodySchema = z.object({
    format: z.enum(["pdf", "xlsx"]),
  });

  app.post("/api/tasks/:taskId/report", requireAuth, async (req, res) => {
    try {
      const parsed = taskReportBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "format must be pdf or xlsx" });
      }
      const userId = req.user!.id;
      const taskId = req.params.taskId;
      const task = await storage.getTask(userId, taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });

      const prices = await getProductivityExportPricesForUser(userId);
      const kind = parsed.data.format === "pdf" ? "taskReportPdf" : "taskReportXlsx";
      const required = priceForKind(prices, kind);
      if (!prices.freeInDev && required > 0) {
        const w = await spendCoins(userId, required, `productivity_export:${kind}`);
        if (!w) {
          const bal = await getOrCreateWallet(userId);
          return res.status(402).json({
            code: "INSUFFICIENT_COINS",
            required,
            balance: bal.balance,
            message: "Not enough AxCoins for this export.",
          });
        }
      }

      const userName = req.user!.displayName || req.user!.email || "User";
      if (parsed.data.format === "pdf") {
        const pdfDoc = generateTaskReportPdf(task, userName);
        res.setHeader("Content-Type", "application/pdf");
        const slug = task.activity
          .slice(0, 40)
          .replace(/[^\w-]+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "") || "report";
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="AxTask-Report-${task.id.slice(0, 8)}-${slug}.pdf"`,
        );
        pdfDoc.pipe(res);
        pdfDoc.end();
      } else {
        const buf = buildTaskReportXlsxBuffer(task);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="AxTask-Report-${task.id.slice(0, 8)}.xlsx"`,
        );
        res.send(buf);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to generate task report" });
    }
  });

  async function assertShoppingListSkillOr403(userId: string, res: Response): Promise<boolean> {
    const ok = await userHasAvatarSkillUnlocked(userId, DENDRITIC_SHOPPING_LIST_SKILL_KEY);
    if (!ok) {
      res.status(403).json({
        code: "SHOPPING_LIST_LOCKED",
        message: "Unlock Dendritic List Sense in the avatar skill tree to use the shopping list workspace and exports.",
      });
      return false;
    }
    return true;
  }

  app.post("/api/tasks/export/shopping-list/html", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      if (!(await assertShoppingListSkillOr403(userId, res))) return;

      const prices = await getProductivityExportPricesForUser(userId);
      const required = priceForKind(prices, "shoppingListExport");
      if (!prices.freeInDev && required > 0) {
        const w = await spendCoins(userId, required, "productivity_export:shopping_list_html");
        if (!w) {
          const bal = await getOrCreateWallet(userId);
          return res.status(402).json({
            code: "INSUFFICIENT_COINS",
            required,
            balance: bal.balance,
            message: "Not enough AxCoins for this export.",
          });
        }
      }

      const all = await storage.getTasks(userId);
      const shopping = filterShoppingTasks(all);
      if (shopping.length === 0) {
        return res.status(400).json({ message: "No shopping tasks to export." });
      }

      const html = buildShoppingListHtmlDocument(shopping);
      const day = new Date().toISOString().split("T")[0];
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="axtask-shopping-list-${day}.html"`);
      res.send(Buffer.from(html, "utf8"));
    } catch (error) {
      res.status(500).json({ message: "Failed to export shopping list" });
    }
  });

  const shoppingListSpreadsheetSchema = z.object({
    format: z.enum(["csv", "xlsx"]),
  });

  app.post("/api/tasks/export/shopping-list/spreadsheet", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      if (!(await assertShoppingListSkillOr403(userId, res))) return;

      const parsed = shoppingListSpreadsheetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "format must be csv or xlsx" });
      }

      const prices = await getProductivityExportPricesForUser(userId);
      const required = priceForKind(prices, "shoppingListExport");
      if (!prices.freeInDev && required > 0) {
        const w = await spendCoins(userId, required, "productivity_export:shopping_list_spreadsheet");
        if (!w) {
          const bal = await getOrCreateWallet(userId);
          return res.status(402).json({
            code: "INSUFFICIENT_COINS",
            required,
            balance: bal.balance,
            message: "Not enough AxCoins for this export.",
          });
        }
      }

      const all = await storage.getTasks(userId);
      const shopping = filterShoppingTasks(all);
      if (shopping.length === 0) {
        return res.status(400).json({ message: "No shopping tasks to export." });
      }

      const buf = buildShoppingListSpreadsheetBuffer(shopping, parsed.data.format);
      const day = new Date().toISOString().split("T")[0];
      const ext = parsed.data.format === "csv" ? "csv" : "xlsx";
      const mime =
        parsed.data.format === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `attachment; filename="axtask-shopping-list-${day}.${ext}"`);
      res.send(buf);
    } catch (error) {
      res.status(500).json({ message: "Failed to export shopping list" });
    }
  });

  app.post("/api/tasks/export/shopping-list/pdf", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      if (!(await assertShoppingListSkillOr403(userId, res))) return;

      const prices = await getProductivityExportPricesForUser(userId);
      const required = priceForKind(prices, "shoppingListExport");
      if (!prices.freeInDev && required > 0) {
        const w = await spendCoins(userId, required, "productivity_export:shopping_list_pdf");
        if (!w) {
          const bal = await getOrCreateWallet(userId);
          return res.status(402).json({
            code: "INSUFFICIENT_COINS",
            required,
            balance: bal.balance,
            message: "Not enough AxCoins for this export.",
          });
        }
      }

      const all = await storage.getTasks(userId);
      const shopping = filterShoppingTasks(all);
      if (shopping.length === 0) {
        return res.status(400).json({ message: "No shopping tasks to export." });
      }

      const pdfDoc = generateShoppingListPdf(shopping);
      const day = new Date().toISOString().split("T")[0];
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="axtask-shopping-list-${day}.pdf"`);
      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (error) {
      res.status(500).json({ message: "Failed to export shopping list PDF" });
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

      const [graphParameters, feedbackInsights] = await Promise.all([
        populateAnalyticsGraphParametersWithAgent(allTasks),
        getFeedbackInsightsForUser(userId, 500),
      ]);
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
      const userId = req.user!.id;
      const raw = req.params.query ?? "";
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        decoded = raw;
      }
      const tasks = await storage.searchTasks(userId, decoded);
      const q = decoded.trim();
      if (q.length >= 2) {
        await recordTaskFilterIntent({
          userId,
          source: "search",
          value: q,
          route: req.path,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
      }
      let searchCoinBalance: number | undefined;
      if (tasks.length > 0 && q.length >= 2) {
        const coinTry = await tryCappedCoinAward({
          userId,
          reason: ENGAGEMENT.taskSearch.reason,
          amount: ENGAGEMENT.taskSearch.amount,
          dailyCap: ENGAGEMENT.taskSearch.dailyCap,
          details: `Search: ${q.slice(0, 80)}`,
        });
        if (coinTry) searchCoinBalance = coinTry.newBalance;
      }
      const byTask = await getTaskAttachmentIdsForTasks(userId, tasks.map((r) => r.id));
      if (typeof searchCoinBalance === "number") {
        res.setHeader("X-Axtask-Wallet-Balance", String(searchCoinBalance));
      }
      res.json(toPublicTaskListItems(tasks, byTask));
    } catch (error) {
      res.status(500).json({ message: "Failed to search tasks" });
    }
  });

  app.post("/api/tasks/filter-intent", requireAuth, async (req, res) => {
    try {
      const payload = z.object({
        source: z.enum([
          "header_sort_date",
          "header_sort_created",
          "header_sort_updated",
          "header_sort_priority",
          "header_sort_activity",
          "header_sort_classification",
          "header_sort_priority_score",
          "header_sort_status",
          "header_priority",
          "header_status",
          "header_classification",
          "top_priority",
          "top_status",
          "route_chip",
        ]),
        value: z.string().max(120).optional(),
      }).parse(req.body ?? {});
      await recordTaskFilterIntent({
        userId: req.user!.id,
        source: payload.source,
        value: payload.value,
        route: req.path,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      const interactionReward = payload.source.startsWith("header_")
        ? await awardOrganizationInteractionSignal({
          userId: req.user!.id,
          source: payload.source,
        })
        : null;
      res.json({
        ok: true,
        interactionReward,
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to record filter intent" });
    }
  });

  app.get("/api/admin/organization-aptitude-trends", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const hoursRaw = Number(req.query.hours);
      const hours = Number.isFinite(hoursRaw) ? hoursRaw : 24 * 14;
      const trends = await getOrganizationAptitudeTrends(hours);
      res.json({
        ...trends,
        hoursWindow: Math.min(Math.max(1, Math.floor(hours)), 24 * 60),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to load organization aptitude trends" });
    }
  });

  app.get("/api/admin/organization-aptitude-trends/export", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const parsed = z.object({
        format: z.enum(["json", "csv"]).default("json"),
        hours: z.coerce.number().int().min(1).max(24 * 60).optional(),
      }).parse(req.query ?? {});
      const trends = await getOrganizationAptitudeTrends(parsed.hours ?? 24 * 14);
      if (parsed.format === "json") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="organization-aptitude-trends-${new Date().toISOString().slice(0, 10)}.json"`,
        );
        return res.json({
          exportedAt: new Date().toISOString(),
          hoursWindow: parsed.hours ?? 24 * 14,
          ...trends,
        });
      }
      const lines = [
        "section,key,samples,points,coins",
        `totals,all,${trends.totals.samples},${trends.totals.points},${trends.totals.coins}`,
        ...trends.byArchetype.map((r) => `archetype,${r.archetypeKey},${r.samples},${r.points},${r.coins}`),
        ...trends.bySource.map((r) => `source,${r.source},${r.samples},${r.points},${r.coins}`),
      ];
      const csv = `${lines.join("\n")}\n`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="organization-aptitude-trends-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return res.send(csv);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to export organization aptitude trends" });
    }
  });

  // Get tasks by status
  app.get("/api/tasks/status/:status", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const tasks = await storage.getTasksByStatus(userId, req.params.status);
      const byTask = await getTaskAttachmentIdsForTasks(userId, tasks.map((r) => r.id));
      res.json(toPublicTaskListItems(tasks, byTask));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks by status" });
    }
  });

  // Get tasks by priority
  app.get("/api/tasks/priority/:priority", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const tasks = await storage.getTasksByPriority(userId, req.params.priority);
      const byTask = await getTaskAttachmentIdsForTasks(userId, tasks.map((r) => r.id));
      res.json(toPublicTaskListItems(tasks, byTask));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks by priority" });
    }
  });

  app.get("/api/tasks/:id/classifications", requireAuth, async (req, res) => {
    try {
      const task = await storage.getTask(req.user!.id, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      const payload = await getClassificationConfirmPayload(req.user!.id, task);
      res.json(payload);
    } catch (error) {
      console.error("Classifications fetch error:", error);
      res.status(500).json({ message: "Failed to fetch classifications" });
    }
  });

  app.post("/api/tasks/:id/confirm-classification", requireAuth, async (req, res) => {
    try {
      const task = await storage.getTask(req.user!.id, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      const out = await confirmTaskClassificationForUser(req.user!.id, task);
      res.json(out);
    } catch (error: unknown) {
      const pgCode = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
      if (pgCode === "23505") {
        return res.status(400).json({ message: "Already confirmed" });
      }
      if (error instanceof Error) {
        const m = error.message;
        if (m === "Already confirmed" || m === "Contributor cannot confirm own classification reward") {
          return res.status(400).json({ message: m });
        }
        if (m === "No classification to confirm") {
          return res.status(400).json({ message: m });
        }
      }
      console.error("Confirm classification error:", error);
      res.status(500).json({ message: "Failed to confirm classification" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Classification disputes (peer-challenge path; see
  // docs/BASELINE_PUBLISHED_AUDIT.md section 4b #7).
  // Disputes do not touch wallets/coins in this PR; see the plan's
  // "Coin economy neutrality" and docs/OPERATOR_COIN_GRANTS.md.
  // ────────────────────────────────────────────────────────────────────────

  app.post("/api/tasks/:taskId/classification/disputes", requireAuth, async (req, res) => {
    try {
      const task = await storage.getTask(req.user!.id, req.params.taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      const parsed = insertClassificationDisputeSchema.safeParse({
        ...req.body,
        taskId: task.id,
        userId: req.user!.id,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid dispute payload", issues: parsed.error.issues });
      }
      const { originalCategory, suggestedCategory, reason } = parsed.data;
      if (originalCategory === suggestedCategory) {
        return res.status(400).json({ message: "Suggested category must differ from original" });
      }
      if ((task.classification ?? "General") !== originalCategory) {
        return res.status(409).json({ message: "Task classification has changed; refresh and try again" });
      }

      const existing = await getUserDispute(task.id, req.user!.id);
      if (existing) {
        return res.status(409).json({ message: "You have already disputed this classification" });
      }

      const dispute = await createDispute(
        task.id,
        req.user!.id,
        originalCategory,
        suggestedCategory,
        reason ?? null,
      );

      await updateCategoryReviewTracker(originalCategory, suggestedCategory);
      await appendSecurityEvent({
        eventType: "classification_dispute_created",
        route: "/api/tasks/:taskId/classification/disputes",
        method: "POST",
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: {
          hashedActor: hashActor(req.user!.id),
          originalCategory,
          suggestedCategory,
          reasonLength: reason ? reason.length : 0,
        },
      });

      res.status(201).json({
        id: dispute.id,
        taskId: dispute.taskId,
        originalCategory: dispute.originalCategory,
        suggestedCategory: dispute.suggestedCategory,
        reason: dispute.reason,
        createdAt: dispute.createdAt,
      });
    } catch (error: unknown) {
      const pgCode = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
      if (pgCode === "23505") {
        return res.status(409).json({ message: "You have already disputed this classification" });
      }
      console.error("Dispute create error:", error);
      res.status(500).json({ message: "Failed to create dispute" });
    }
  });

  app.get("/api/tasks/:taskId/classification/disputes", requireAuth, async (req, res) => {
    try {
      const task = await storage.getTask(req.user!.id, req.params.taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      const rows = await getDisputesForTask(task.id);
      const myVotes: Record<string, boolean | null> = {};
      for (const r of rows) {
        const vote = await getUserVoteOnDispute(r.id, req.user!.id);
        myVotes[r.id] = vote ? vote.agree : null;
      }
      res.json({
        disputes: rows.map((r) => ({
          id: r.id,
          taskId: r.taskId,
          userId: r.userId,
          displayName: r.displayName,
          originalCategory: r.originalCategory,
          suggestedCategory: r.suggestedCategory,
          reason: r.reason,
          createdAt: r.createdAt,
          agreeCount: r.agreeCount,
          disagreeCount: r.disagreeCount,
          totalVotes: r.totalVotes,
          myVote: myVotes[r.id],
        })),
      });
    } catch (error) {
      console.error("Disputes fetch error:", error);
      res.status(500).json({ message: "Failed to fetch disputes" });
    }
  });

  app.post("/api/classification/disputes/:disputeId/vote", requireAuth, async (req, res) => {
    try {
      const voteSchema = z.object({ agree: z.boolean() });
      const parsed = voteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid vote payload" });
      }

      const dispute = await getDisputeById(req.params.disputeId);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }
      if (dispute.userId === req.user!.id) {
        return res.status(403).json({ message: "You cannot vote on your own dispute" });
      }

      const vote = await voteOnDispute(req.params.disputeId, req.user!.id, parsed.data.agree);
      const tracker = await updateCategoryReviewTracker(dispute.originalCategory, dispute.suggestedCategory);
      const tally = await getVoteTallyForDispute(dispute.id);

      await appendSecurityEvent({
        eventType: "classification_dispute_vote",
        route: "/api/classification/disputes/:disputeId/vote",
        method: "POST",
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: {
          hashedActor: hashActor(req.user!.id),
          agree: parsed.data.agree,
          trackerStatus: tracker.status,
        },
      });

      res.json({
        vote: { id: vote.id, agree: vote.agree, updatedAt: vote.updatedAt },
        tally,
        trackerStatus: tracker.status,
      });
    } catch (error) {
      console.error("Dispute vote error:", error);
      res.status(500).json({ message: "Failed to record vote" });
    }
  });

  app.get("/api/classification/disputes/:disputeId/votes", requireAuth, async (req, res) => {
    try {
      const dispute = await getDisputeById(req.params.disputeId);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }
      const tally = await getVoteTallyForDispute(dispute.id);
      const myVote = await getUserVoteOnDispute(dispute.id, req.user!.id);
      res.json({
        ...tally,
        myVote: myVote ? myVote.agree : null,
      });
    } catch (error) {
      console.error("Dispute vote tally error:", error);
      res.status(500).json({ message: "Failed to fetch vote tally" });
    }
  });

  // Get task by ID
  app.get("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const accessible = await getAccessibleTaskForUser(req.user!.id, req.params.id);
      if (!accessible) {
        return res.status(404).json({ message: "Task not found" });
      }
      /* Detail DTO: keeps classificationAssociations for the classify
       * dialog but still strips `userId`. */
      res.json(toPublicTaskDetail(accessible.task, accessible.viewerRole));
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
              const { result: clsRes, associations } = await classifyWithAssociations(
                task.activity,
                task.notes || "",
                { preferExternal: false },
              );
              updates.push({
                id: task.id,
                priority: priorityResult.priority,
                priorityScore: Math.round(priorityResult.score * 10),
                classification: clsRes.classification,
                classificationAssociations: associations,
                isRepeated: priorityResult.isRepeated,
              });
            } catch (e) {
              const { result: clsRes, associations } = await classifyWithAssociations(
                task.activity,
                task.notes || "",
                { preferExternal: false },
              );
              updates.push({
                id: task.id,
                priority: "Low",
                priorityScore: 0,
                classification: clsRes.classification,
                classificationAssociations: associations,
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

      const { result: clsRes, associations, shoppingDetection } = await classifyWithAssociations(
        task.activity,
        task.notes || "",
        { preferExternal: true },
      );

      task = await storage.updateTask(userId, {
        id: task.id,
        priority: priorityResult.priority,
        priorityScore: Math.round(priorityResult.score * 10),
        classification: clsRes.classification,
        classificationAssociations: associations,
        isRepeated: priorityResult.isRepeated,
      }) || task;

      learnFromTask(userId, task, allTasks).catch(err =>
        console.error("[PatternEngine] learn error:", err)
      );

      const uniqueTaskReward = await tryCappedCoinAward({
        userId,
        reason: ENGAGEMENT.uniqueTaskCreate.reason,
        amount: ENGAGEMENT.uniqueTaskCreate.amount,
        dailyCap: ENGAGEMENT.uniqueTaskCreate.dailyCap,
        details: `New task: ${task.activity.slice(0, 100)}`,
        taskId: task.id,
      });

      res.status(201).json({ ...task, uniqueTaskReward, shoppingDetection });
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

      const access = await canAccessTask(userId, req.params.id);
      if (!access.canAccess) {
        return res.status(404).json({ message: "Task not found" });
      }
      if (access.role === "viewer") {
        return res.status(403).json({ message: "Viewer collaborators are read-only" });
      }

      const existingAccess = await getAccessibleTaskForUser(userId, req.params.id);
      const existingTask = existingAccess?.task;
      const previousStatus = existingTask?.status || "pending";

      let task = access.role === "owner"
        ? await storage.updateTask(userId, validatedData)
        : await updateTaskById(validatedData);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      let shoppingDetection: {
        detected: boolean;
        format: string;
        items: string[];
        confidence: number;
        source: string;
      } | null = null;

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

        const { result: clsRes, associations, shoppingDetection: nextShoppingDetection } = await classifyWithAssociations(
          task!.activity,
          task!.notes || "",
          { preferExternal: true },
        );
        shoppingDetection = nextShoppingDetection;

        task = access.role === "owner"
          ? await storage.updateTask(userId, {
            id: task!.id,
            priority: priorityResult.priority,
            priorityScore: Math.round(priorityResult.score * 10),
            classification: clsRes.classification,
            classificationAssociations: associations,
            isRepeated: priorityResult.isRepeated,
          })
          : await updateTaskById({
          id: task!.id,
          priority: priorityResult.priority,
          priorityScore: Math.round(priorityResult.score * 10),
          classification: clsRes.classification,
          classificationAssociations: associations,
          isRepeated: priorityResult.isRepeated,
        }) || task;
      }

      const latestTask = await getAccessibleTaskForUser(userId, req.params.id);
      task = latestTask?.task || task;

      let coinReward = null;
      let coinSkipReason: string | null = null;
      let walletBalance: number | null = null;
      let organizationReward = null;
      if (access.role === "owner" && task!.status === "completed" && previousStatus !== "completed") {
        coinReward = await awardCoinsForCompletion(userId, task!, previousStatus);
        if (!coinReward) {
          const alreadyAwarded = await hasTaskBeenAwarded(userId, task!.id);
          coinSkipReason = completionCoinSkipReason({
            previousStatus,
            taskStatus: task!.status,
            coinReward,
            alreadyAwarded,
          });
          walletBalance = (await getOrCreateWallet(userId)).balance;
        } else {
          walletBalance = coinReward.newBalance;
        }
        const followthroughReward = await maybeAwardOrganizationFollowthrough({
          userId,
          taskId: task!.id,
        });
        organizationReward = followthroughReward;
        if (followthroughReward.awarded) {
          walletBalance = (await getOrCreateWallet(userId)).balance;
        }
      }
      let classificationReward = null;
      const previousClassification = existingTask?.classification;
      if (
        access.role === "owner"
        && task!.classification
        && task!.classification !== "General"
        && task!.classification !== previousClassification
      ) {
        classificationReward = await awardCoinsForClassification(userId, task!);
      }

      res.json({
        ...task,
        coinReward,
        coinSkipReason,
        walletBalance,
        classificationReward,
        organizationReward,
        shoppingDetection,
      });
    } catch (error) {
      console.error("[TASK UPDATE ERROR]", error);
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to update task" });
      }
    }
  });

  const reclassifyTaskSchema = z
    .object({
      classification: z.string().min(2).max(64).optional(),
      associations: classificationAssociationsSchema.optional(),
      baseUpdatedAt: z.string().optional(),
    })
    .refine(
      (d) =>
        Boolean(d.classification?.trim() && d.classification.trim().length >= 2) ||
        (Array.isArray(d.associations) && d.associations.length >= 1),
      { message: "Provide classification or associations" },
    );

  function associationsFingerprint(rows: ClassificationAssociation[] | null | undefined): string {
    const list = [...(rows ?? [])].map((r) => `${r.label.toLowerCase()}:${Math.round(r.confidence * 1000)}`);
    list.sort();
    return list.join("|");
  }

  app.post("/api/tasks/:id/reclassify", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const payload = reclassifyTaskSchema.parse(req.body || {});
      const task = await storage.getTask(userId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      let nextAssociations: ClassificationAssociation[];
      let nextPrimary: string;
      if (payload.associations && payload.associations.length > 0) {
        nextAssociations = normalizeAssociationWeights(payload.associations);
        nextAssociations = [...nextAssociations].sort((a, b) => b.confidence - a.confidence);
        nextPrimary = nextAssociations[0].label;
      } else {
        nextPrimary = payload.classification!.trim();
        nextAssociations = [{ label: nextPrimary, confidence: 1 }];
      }

      const samePrimary =
        task.classification.trim().toLowerCase() === nextPrimary.trim().toLowerCase();
      const sameAssoc =
        associationsFingerprint(task.classificationAssociations) === associationsFingerprint(nextAssociations);
      if (samePrimary && sameAssoc) {
        return res.json({ ...task, classification: task.classification });
      }

      const primaryChanged = !samePrimary;

      const updatedTask = await storage.updateTask(userId, {
        id: task.id,
        classification: nextPrimary,
        classificationAssociations: nextAssociations,
      });
      if (!updatedTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (!primaryChanged) {
        return res.json({
          ...updatedTask,
          classification: nextPrimary,
          classificationReward: undefined,
          consensusCorrectionReward: null,
          consensusTierBonus: null,
        });
      }

      const [confirmationCountRow] = await db
        .select({ value: count() })
        .from(taskClassificationConfirmations)
        .where(eq(taskClassificationConfirmations.taskId, task.id));
      const confirmationCount = Number(confirmationCountRow?.value) || 0;

      const coinsByLabel = new Map(
        BUILT_IN_CLASSIFICATIONS.map((entry) => [entry.label.toLowerCase(), entry.coins]),
      );
      const coinsEarned = Math.max(1, coinsByLabel.get(nextPrimary.toLowerCase()) ?? 2);
      const { wallet: classificationWallet } = await addCoins(
        userId,
        coinsEarned,
        "task_classification",
        `Reclassified task as ${nextPrimary}`,
        task.id,
      );
      const consensusReward =
        confirmationCount >= 2
          ? await tryCappedCoinAward({
              userId,
              reason: ENGAGEMENT.classificationCorrectionConsensus.reason,
              amount: ENGAGEMENT.classificationCorrectionConsensus.amount,
              dailyCap: ENGAGEMENT.classificationCorrectionConsensus.dailyCap,
              details: `Consensus correction: ${nextPrimary} (${confirmationCount} confirmations)`,
              taskId: task.id,
            })
          : null;
      const consensusTierBonus =
        confirmationCount >= 4
          ? await tryCappedCoinAward({
              userId,
              reason: ENGAGEMENT.consensusTierBonus.reason,
              amount: ENGAGEMENT.consensusTierBonus.amount,
              dailyCap: ENGAGEMENT.consensusTierBonus.dailyCap,
              details: `Consensus tier bonus: ${nextPrimary} (${confirmationCount} confirmations)`,
              taskId: task.id,
            })
          : null;
      const walletBalanceAfterAllRewards =
        consensusTierBonus?.newBalance ??
        consensusReward?.newBalance ??
        classificationWallet.balance;

      return res.json({
        ...updatedTask,
        classification: nextPrimary,
        classificationReward: {
          coinsEarned,
          classification: nextPrimary,
          newBalance: walletBalanceAfterAllRewards,
        },
        consensusCorrectionReward: consensusReward,
        consensusTierBonus,
        confirmationCount,
      });
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      return res.status(500).json({ message: "Failed to reclassify task" });
    }
  });

  app.get("/api/tasks/:id/classification-thumb", requireAuth, async (req, res) => {
    try {
      const state = await getClassificationThumbState(req.params.id, req.user!.id);
      res.json(state);
    } catch (error) {
      res.status(500).json({ message: "Failed to load classification thumb state" });
    }
  });

  app.post("/api/tasks/:id/classification-thumb", requireAuth, async (req, res) => {
    try {
      const result = await awardClassificationThumbUp(req.user!.id, req.params.id);
      if (!result.ok) {
        const status =
          result.code === "task_not_found"
            ? 404
            : result.code === "no_classification"
              ? 400
              : 409;
        return res.status(status).json({ message: result.code });
      }
      res.json({
        coinsEarned: result.coinsEarned,
        newBalance: result.newBalance,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to record classification thumb" });
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

        const { result: clsRes, associations } = await classifyWithAssociations(
          task.activity,
          task.notes || "",
          { preferExternal: false },
        );

        await storage.updateTask(userId, {
          id: task.id,
          priority: priorityResult.priority,
          priorityScore: Math.round(priorityResult.score * 10),
          classification: clsRes.classification,
          classificationAssociations: associations,
          isRepeated: priorityResult.isRepeated,
        });
      }

      const recalculateReward =
        allTasks.length > 0
          ? await tryCappedCoinAward({
              userId,
              reason: ENGAGEMENT.recalculate.reason,
              amount: ENGAGEMENT.recalculate.amount,
              dailyCap: ENGAGEMENT.recalculate.dailyCap,
              details: `Recalculated ${allTasks.length} task priorities`,
            })
          : null;

      res.json({ message: "All priorities recalculated successfully", recalculateReward });
    } catch (error) {
      res.status(500).json({ message: "Failed to recalculate priorities" });
    }
  });

  const recalculateRatingSchema = z.object({
    rating: z.number().int().min(1).max(5),
  });

  app.post("/api/tasks/recalculate/rating", requireAuth, async (req, res) => {
    try {
      const { rating } = recalculateRatingSchema.parse(req.body || {});
      const reward =
        rating >= 4
          ? await tryCappedCoinAward({
              userId: req.user!.id,
              reason: ENGAGEMENT.recalculateRating.reason,
              amount: ENGAGEMENT.recalculateRating.amount,
              dailyCap: ENGAGEMENT.recalculateRating.dailyCap,
              details: `Urgency recalculate rating submitted: ${rating}/5`,
            })
          : null;
      res.status(201).json({ ok: true, rating, reward });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to submit recalculate rating" });
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

  app.get("/api/google-sheets/spreadsheet/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { accessToken, refreshToken } = req.query;

      if (!accessToken) {
        return res.status(400).json({ message: "Access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken: accessToken as string,
        refreshToken: refreshToken as string
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

          const { result: clsRes, associations } = await classifyWithAssociations(
            task.activity,
            task.notes || "",
            { preferExternal: false },
          );

          const updatedTask = await storage.updateTask(userId, {
            id: task.id,
            priority: priorityResult.priority,
            priorityScore: Math.round(priorityResult.score * 10),
            classification: clsRes.classification,
            classificationAssociations: associations,
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

  app.post("/api/checklist/:date/download", requireAuth, async (req, res) => {
    try {
      const { date } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
      }
      const userId = req.user!.id;
      const prices = await getProductivityExportPricesForUser(userId);
      const required = priceForKind(prices, "checklistPdf");
      if (!prices.freeInDev && required > 0) {
        const w = await spendCoins(userId, required, "productivity_export:checklist_pdf");
        if (!w) {
          const bal = await getOrCreateWallet(userId);
          return res.status(402).json({
            code: "INSUFFICIENT_COINS",
            required,
            balance: bal.balance,
            message: "Not enough AxCoins for this checklist PDF.",
          });
        }
      }

      const allTasks = await storage.getTasks(userId);
      const dayTasks = allTasks.filter((t) => t.date === date);
      const userName = req.user!.displayName || req.user!.email;
      const pdfDoc = generateChecklistPDF(dayTasks, date, userName);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="AxTask-Checklist-${date}.pdf"`);

      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (error) {
      console.error("Checklist PDF download error:", error);
      res.status(500).json({ message: "Failed to generate checklist" });
    }
  });

  app.get("/api/checklist/:date", requireAuth, async (req, res) => {
    try {
      if (process.env.NODE_ENV === "production") {
        return res.status(402).json({
          code: "PAYMENT_REQUIRED",
          message: "Use Print Checklist in the app to download the PDF (AxCoins).",
        });
      }

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
      const shoppingTasks = pendingTasks.filter((t) =>
        isShoppingTask({ classification: t.classification, activity: t.activity, notes: t.notes }),
      );
      const purchasedShoppingEvents = await listPurchasedShoppingEventsForUser(userId);
      const recurrencePatterns = await getPatternsByType(userId, "recurrence");
      const repurchaseSuggestions = inferGroceryRepurchaseSuggestions({
        now,
        purchaseEvents: purchasedShoppingEvents,
        recurrencePatterns,
        limit: 6,
      });

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
        shopping: {
          count: shoppingTasks.length,
          tasks: shoppingTasks.slice(0, 8),
          repurchaseSuggestions,
        },
      });
    } catch (error) {
      console.error("Planner briefing error:", error);
      res.status(500).json({ message: "Failed to generate planner briefing" });
    }
  });

  const groceryReminderSuggestSchema = z.object({
    applyOptInAutomation: z.boolean().optional().default(false),
  });

  app.post("/api/grocery-reminders/suggest", requireAuth, async (req, res) => {
    try {
      const { applyOptInAutomation } = groceryReminderSuggestSchema.parse(req.body || {});
      const userId = req.user!.id;
      const now = new Date();
      const purchasedShoppingEvents = await listPurchasedShoppingEventsForUser(userId);
      const recurrencePatterns = await getPatternsByType(userId, "recurrence");
      const suggestions = inferGroceryRepurchaseSuggestions({
        now,
        purchaseEvents: purchasedShoppingEvents,
        recurrencePatterns,
        limit: 8,
      });

      const preference = await getUserNotificationPreference(userId);
      const automation = {
        taskCreated: 0,
        notificationQueued: 0,
      };

      if (applyOptInAutomation && preference.groceryReminderEnabled) {
        const highConfidence = suggestions.filter((s) => s.confidence >= 72).slice(0, 3);
        if (preference.groceryAutoCreateTaskEnabled) {
          const existingTasks = await storage.getTasks(userId);
          const existingKeys = new Set(
            existingTasks
              .filter((t) => t.status !== "completed")
              .map((t) => `${t.date}|${t.activity}`.toLowerCase()),
          );
          for (const row of highConfidence) {
            const activity = `Buy ${row.item}`;
            const key = `${row.suggestedDate}|${activity}`.toLowerCase();
            if (existingKeys.has(key)) continue;
            await storage.createTask(userId, {
              date: row.suggestedDate,
              time: "",
              activity,
              notes: `Auto-suggested from grocery cadence (${row.source}).`,
              urgency: 3,
              impact: 3,
              effort: 1,
              prerequisites: "",
              recurrence: "none",
              status: "pending",
              visibility: "private",
              communityShowNotes: false,
            });
            existingKeys.add(key);
            automation.taskCreated += 1;
          }
        }

        if (preference.groceryAutoNotifyEnabled && highConfidence.length > 0) {
          const top = highConfidence[0]!;
          await createAdherenceIntervention({
            userId,
            signal: "reminder_ignored",
            title: "Grocery reminder from your cadence",
            message: `You usually repurchase ${top.item} every ~${top.avgDays} days. Consider adding it now.`,
            context: {
              grocerySuggestion: {
                item: top.item,
                confidence: top.confidence,
                suggestedDate: top.suggestedDate,
              },
            },
            dedupeKey: `grocery:${top.item}:${top.suggestedDate}`,
          });
          automation.notificationQueued += 1;
        }
      }

      return res.json({ suggestions, automation });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      return res.status(500).json({ message: "Failed to build grocery reminder suggestions" });
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
      const responseBody = { answer: result.answer, relatedTasks: result.relatedTasks.slice(0, 5) };
      res.json(responseBody);
      void trackAiRequestEvent({
        actorUserId: req.user!.id,
        route: "/api/planner/ask",
        method: "POST",
        statusCode: 200,
        source: "planner_engine",
        disabledExternalClassifier: !aiRuntimeFlags.externalClassifierEnabled,
      });
    } catch (error) {
      console.error("Planner Q&A error:", error);
      res.status(500).json({ message: "Failed to answer question" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Study mini-games routes (protected)
  // ════════════════════════════════════════════════════════════════════════
  app.use("/api/study", apiLimiter);

  app.get("/api/study/decks", requireAuth, async (req, res) => {
    try {
      const decks = await listStudyDecks(req.user!.id);
      res.json(decks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study decks" });
    }
  });

  app.post("/api/study/decks", requireAuth, async (req, res) => {
    try {
      const payload = createStudyDeckSchema.parse(req.body);
      const deck = await createStudyDeck(req.user!.id, payload);
      res.status(201).json(deck);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to create study deck" });
    }
  });

  app.get("/api/study/decks/:id/cards", requireAuth, async (req, res) => {
    try {
      const cards = await listStudyCards(req.user!.id, req.params.id);
      res.json(cards);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch deck cards" });
    }
  });

  app.post("/api/study/decks/:id/cards", requireAuth, async (req, res) => {
    try {
      const payload = createStudyCardSchema.parse({ ...req.body, deckId: req.params.id });
      const card = await createStudyCard(req.user!.id, req.params.id, payload);
      res.status(201).json(card);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to create card" });
    }
  });

  app.post("/api/study/sessions/start", requireAuth, async (req, res) => {
    try {
      const payload = startStudySessionSchema.parse(req.body);
      const session = await startStudySession(req.user!.id, payload);
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to start study session" });
    }
  });

  app.post("/api/study/sessions/:id/answer", requireAuth, async (req, res) => {
    try {
      const payload = submitStudyAnswerSchema.parse(req.body);
      const result = await submitStudyAnswer(req.user!.id, req.params.id, payload);
      res.json(result);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to submit study answer" });
    }
  });

  app.get("/api/study/sessions/:id/summary", requireAuth, async (req, res) => {
    try {
      const summary = await getStudySessionSummary(req.user!.id, req.params.id);
      if (!summary) return res.status(404).json({ message: "Session not found" });
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study summary" });
    }
  });

  app.get("/api/study/stats", requireAuth, async (req, res) => {
    try {
      const stats = await getStudyStats(req.user!.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study stats" });
    }
  });

  app.get("/api/voice/preferences", requireAuth, async (req, res) => {
    try {
      const preference = await getUserVoicePreference(req.user!.id);
      res.json(preference);
    } catch {
      res.status(500).json({ message: "Failed to fetch voice preferences" });
    }
  });

  app.patch("/api/voice/preferences", requireAuth, async (req, res) => {
    try {
      const payload = updateVoicePreferenceSchema.parse(req.body || {});
      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ message: "At least one preference field is required" });
      }
      const preference = await upsertUserVoicePreference({
        userId: req.user!.id,
        listeningMode: payload.listeningMode,
      });
      return res.json(preference);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.issues[0]?.message ?? "Invalid request body",
        });
      }
      console.error("[voice/preferences] PATCH failed", error);
      return res.status(500).json({ message: "Failed to update voice preferences" });
    }
  });

  const publicHolidaysQuerySchema = z.object({
    country: z
      .string()
      .length(2)
      .regex(/^[A-Za-z]{2}$/)
      .transform((s) => s.toUpperCase()),
    years: z
      .string()
      .regex(/^\d{4}(,\d{4}){0,9}$/)
      .transform((s) => s.split(",").map((x) => Number.parseInt(x, 10))),
  });

  app.get("/api/calendar/preferences", requireAuth, async (req, res) => {
    try {
      const preference = await getUserCalendarPreference(req.user!.id);
      res.json(preference);
    } catch {
      res.status(500).json({ message: "Failed to fetch calendar preferences" });
    }
  });

  app.patch("/api/calendar/preferences", requireAuth, async (req, res) => {
    try {
      const payload = updateCalendarPreferenceSchema.parse(req.body || {});
      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ message: "At least one preference field is required" });
      }
      const preference = await upsertUserCalendarPreference({
        userId: req.user!.id,
        showHolidays: payload.showHolidays,
        holidayCountryCode: payload.holidayCountryCode,
      });
      return res.json(preference);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.issues[0]?.message ?? "Invalid request body",
        });
      }
      console.error("[calendar/preferences] PATCH failed", error);
      return res.status(500).json({ message: "Failed to update calendar preferences" });
    }
  });

  app.get("/api/calendar/public-holidays", requireAuth, async (req, res) => {
    try {
      const q = publicHolidaysQuerySchema.parse(req.query);
      if (q.years.some((y) => !Number.isFinite(y) || y < 1990 || y > 2100)) {
        return res.status(400).json({ message: "years must be between 1990 and 2100" });
      }
      if (q.years.length > 10) {
        return res.status(400).json({ message: "At most 10 years per request" });
      }
      const { holidays, hadUpstreamData } = await loadMergedPublicHolidays(q.country, q.years);
      res.json({ holidays, meta: { hadUpstreamData } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.issues[0]?.message ?? "Invalid query" });
      }
      console.error("[calendar/public-holidays] GET failed", error);
      return res.status(500).json({ message: "Failed to load public holidays" });
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
      const companion = await applyVoiceCompanionRewards(userId, result);
      res.json(companion ? { ...result, companion } : result);
      void trackAiRequestEvent({
        actorUserId: req.user!.id,
        route: "/api/voice/process",
        method: "POST",
        statusCode: 200,
        source: result.intent,
        disabledExternalClassifier: !aiRuntimeFlags.externalClassifierEnabled,
      });
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
      if (transcript.length > TASK_NOTES_MAX_CHARS) {
        return res.status(400).json({
          message: `Transcript must be under ${TASK_NOTES_MAX_CHARS} characters`,
        });
      }
      const sanitized = transcript.replace(/<[^>]*>/g, "").trim();

      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);
      const now = new Date();
      const result = processTaskReview(sanitized, allTasks, now);
      res.json(result);
      void trackAiRequestEvent({
        actorUserId: req.user!.id,
        route: "/api/tasks/review",
        method: "POST",
        statusCode: 200,
        source: "review_engine",
        disabledExternalClassifier: !aiRuntimeFlags.externalClassifierEnabled,
      });
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
                  if (updatedTask.status === "completed" && previousStatus !== "completed") {
                    void maybeAwardOrganizationFollowthrough({
                      userId,
                      taskId: updatedTask.id,
                    });
                  }
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
                updatePayload.notes = action.details.notes.slice(0, TASK_NOTES_MAX_CHARS);
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

  try {
    await seedRewardsCatalog();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[seed] Rewards catalog seed failed (${msg}). Start PostgreSQL and ensure DATABASE_URL is correct. The server will continue; gamification data may be incomplete until the database is reachable.`,
    );
  }
  try {
    await seedOfflineSkillTree();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[seed] Offline skill tree seed failed (${msg}). Start PostgreSQL and ensure DATABASE_URL is correct. The server will continue.`,
    );
  }
  try {
    await seedAvatarSkillTree();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[seed] Avatar skill tree seed failed (${msg}). Start PostgreSQL and ensure DATABASE_URL is correct. The server will continue.`,
    );
  }

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
      res.json(toPublicWallet(wallet));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  app.get("/api/gamification/classification-stats", requireAuth, async (req, res) => {
    try {
      const [stats] = await db
        .select({
          totalClassifications: sql<number>`
            coalesce(sum(case when ${coinTransactions.reason} = 'task_classification' then 1 else 0 end), 0)
          `,
          totalConfirmationsReceived: sql<number>`
            coalesce(sum(case when ${coinTransactions.reason} = 'classification_confirmation_received' then 1 else 0 end), 0)
          `,
          totalClassificationCoins: sql<number>`
            coalesce(sum(case when ${coinTransactions.reason} in (
              'task_classification',
              'classification_confirmation_received',
              'classification_confirmer'
            ) then ${coinTransactions.amount} else 0 end), 0)
          `,
        })
        .from(coinTransactions)
        .where(eq(coinTransactions.userId, req.user!.id));

      res.json({
        totalClassifications: Number(stats?.totalClassifications ?? 0),
        totalConfirmationsReceived: Number(stats?.totalConfirmationsReceived ?? 0),
        totalClassificationCoins: Number(stats?.totalClassificationCoins ?? 0),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch classification stats" });
    }
  });

  app.get("/api/gamification/transactions", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const txs = await getTransactions(req.user!.id, limit);
      res.json(toPublicCoinTransactions(txs));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.get("/api/gamification/badges", requireAuth, async (req, res) => {
    try {
      const earned = await getUserBadges(req.user!.id);
      const earnedIds = earned.map((b) => b.badgeId);
      res.json({
        earned: toPublicBadges(earned),
        definitions: toPublicBadgeDefinitions(BADGE_DEFINITIONS, earnedIds),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

  app.post("/api/gamification/chip-hunt/sync", requireAuth, async (req, res) => {
    try {
      const parsed = z
        .object({
          chaseMsDelta: z.number().finite().min(0).max(2_000_000),
          catchEvent: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid body" });
      }
      const { chaseMsDelta, catchEvent } = parsed.data;
      if (chaseMsDelta === 0 && !catchEvent) {
        return res.json({ badgesEarned: [] as string[] });
      }
      const { badgesEarned } = await processChipHuntSync(req.user!.id, chaseMsDelta, Boolean(catchEvent));
      res.json({ badgesEarned });
    } catch (error) {
      res.status(500).json({ message: "Chip hunt sync failed" });
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

  app.get("/api/gamification/productivity-export-prices", requireAuth, async (req, res) => {
    try {
      const prices = await getProductivityExportPricesForUser(req.user!.id);
      res.json(prices);
    } catch (error) {
      res.status(500).json({ message: "Failed to load export prices" });
    }
  });

  app.post("/api/gamification/rewards/sell-back", requireAuth, async (req, res) => {
    try {
      const body = z.object({ userRewardId: z.string().uuid() }).safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ message: "userRewardId is required" });
      }
      const result = await sellBackUserReward(req.user!.id, body.data.userRewardId);
      if (!result.ok) {
        return res.status(404).json({ message: "Reward not found" });
      }
      const wallet = await getOrCreateWallet(req.user!.id);
      res.json({
        message:
          result.refund > 0
            ? `Sold back for ${result.refund} AxCoins`
            : "Item removed (no coin refund for avatar-level unlocks)",
        refund: result.refund,
        wallet: toPublicWallet(wallet),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to sell back reward" });
    }
  });

  function ownerCoinGrantAllowlist(): Set<string> {
    const raw = process.env.OWNER_COIN_GRANT_USER_IDS ?? "";
    return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  }

  app.post("/api/gamification/owner/grant-coins", requireAuth, async (req, res) => {
    try {
      if (!ownerCoinGrantAllowlist().has(req.user!.id)) {
        return res.status(404).json({ message: "Not found" });
      }
      const body = z
        .object({
          targetUserId: z.string().uuid(),
          amount: z.number().int().positive().max(1_000_000_000),
          note: z.string().max(500).optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ message: "targetUserId and a positive amount are required" });
      }
      const result = await ownerGrantCoinsToUser(body.data.targetUserId, body.data.amount, body.data.note);
      if (!result.ok) {
        if (result.code === "user_not_found") return res.status(404).json({ message: "User not found" });
        return res.status(400).json({ message: "Invalid amount" });
      }
      await logSecurityEvent(
        "owner_coin_grant",
        req.user!.id,
        body.data.targetUserId,
        req.ip ?? undefined,
        `amount=${body.data.amount}; note=${body.data.note ?? ""}`,
      );
      res.json({ ok: true, wallet: toPublicWallet(result.wallet) });
    } catch (error) {
      res.status(500).json({ message: "Failed to grant coins" });
    }
  });

  app.post("/api/gamification/redeem", requireAuth, async (req, res) => {
    try {
      const { rewardId } = req.body;
      if (!rewardId || typeof rewardId !== "string") {
        return res.status(400).json({ message: "Reward ID is required" });
      }
      const reward = await getRewardById(rewardId);
      const maxLevel = await getMaxAvatarLevel(req.user!.id);
      const success = await redeemReward(req.user!.id, rewardId);
      if (!success) {
        return res.status(400).json({ message: "Insufficient coins, ineligible level, or reward not found" });
      }
      const wallet = await getOrCreateWallet(req.user!.id);
      const unlockedByLevel =
        reward?.unlockAtAvatarLevel != null && maxLevel >= reward.unlockAtAvatarLevel;
      res.json({
        message: unlockedByLevel ? "Reward unlocked via avatar level!" : "Reward redeemed!",
        unlockedByLevel,
        wallet: toPublicWallet(wallet),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to redeem reward" });
    }
  });

  const alarmSnapshotBodySchema = z.object({
    deviceKey: z.string().max(80).optional(),
    label: z.string().max(120).optional(),
    payloadJson: z.string().min(2).max(500_000),
  });

  app.get("/api/alarm-snapshots", requireAuth, async (req, res) => {
    try {
      const rows = await listUserAlarmSnapshots(req.user!.id);
      res.json({
        snapshots: rows.map((r) => ({
          id: r.id,
          deviceKey: r.deviceKey,
          label: r.label,
          capturedAt: r.capturedAt,
          createdAt: r.createdAt,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to list alarm snapshots" });
    }
  });

  app.post("/api/alarm-snapshots", requireAuth, async (req, res) => {
    try {
      const body = alarmSnapshotBodySchema.parse(req.body || {});
      const row = await createUserAlarmSnapshot(req.user!.id, body);
      res.status(201).json({
        id: row.id,
        deviceKey: row.deviceKey,
        label: row.label,
        capturedAt: row.capturedAt,
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to save alarm snapshot" });
    }
  });

  app.get("/api/alarm-snapshots/:id/payload", requireAuth, async (req, res) => {
    try {
      const row = await getUserAlarmSnapshot(req.user!.id, req.params.id);
      if (!row) return res.status(404).json({ message: "Snapshot not found" });
      res.json({ payloadJson: row.payloadJson, label: row.label, deviceKey: row.deviceKey, capturedAt: row.capturedAt });
    } catch (error) {
      res.status(500).json({ message: "Failed to load alarm snapshot" });
    }
  });

  app.get("/api/alarm-capabilities", requireAuth, async (_req, res) => {
    const companionApplyUrl = (process.env.AXTASK_ALARM_COMPANION_URL || "").trim();
    const companionSecretConfigured = (process.env.AXTASK_ALARM_COMPANION_SECRET || "").trim().length > 0;
    res.json({
      companionConfigured: companionApplyUrl.length > 0,
      companionSecretConfigured,
      nativeBridgeHints: {
        android: process.env.VITE_ENABLE_ANDROID_REMINDERS === "true",
        windows: process.env.VITE_ENABLE_WINDOWS_REMINDERS === "true",
      },
    });
  });

  app.post("/api/alarm-companion/apply", requireAuth, async (req, res) => {
    try {
      const companionApplyUrl = (process.env.AXTASK_ALARM_COMPANION_URL || "").trim();
      if (!companionApplyUrl) {
        return res.status(503).json({ message: "Alarm companion endpoint is not configured" });
      }
      const body = z.object({ payloadJson: z.string().min(2).max(500_000) }).parse(req.body || {});
      const companionSecret = (process.env.AXTASK_ALARM_COMPANION_SECRET || "").trim();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const t0 = Date.now();
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (companionSecret) {
          headers.authorization = `Bearer ${companionSecret}`;
        }
        const upstream = await fetch(companionApplyUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            userId: req.user!.id,
            payloadJson: body.payloadJson,
          }),
          signal: controller.signal,
        });
        const text = await upstream.text();
        const ms = Date.now() - t0;
        const uid = req.user!.id;
        const uidShort = uid.length > 8 ? `${uid.slice(0, 8)}…` : uid;
        console.log(
          `[alarm-companion-proxy] user=${uidShort} status=${upstream.status} ms=${ms} payloadBytes=${body.payloadJson.length}`,
        );
        if (!upstream.ok) {
          return res.status(502).json({
            message: "Companion apply failed",
            companionStatus: upstream.status,
            companionBody: text,
          });
        }
        return res.json({ ok: true, companionResponse: text || "ok" });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      return res.status(500).json({ message: "Failed to apply alarm via companion" });
    }
  });

  const collabBodySchema = z.object({
    body: z.string().min(1).max(8000),
    taskId: z.string().uuid().optional(),
    attachmentAssetIds: z.array(z.string().min(1)).max(8).default([]),
  });

  app.get("/api/collaboration/inbox", requireAuth, async (req, res) => {
    try {
      const rows = await listCollaborationInbox(req.user!.id);
      // Single batched query instead of one per row (N+1 fix, Phase E).
      const assetsByOwner = await getAttachmentsForOwnersBatch({
        userId: req.user!.id,
        ownerType: "collab_message",
        ownerIds: rows.map((r) => r.id),
      });
      const decorated = rows.map((row) => ({
        ...row,
        attachments: toPublicAttachmentRefs(assetsByOwner.get(row.id) ?? []),
      }));
      res.json({ messages: decorated });
    } catch (error) {
      res.status(500).json({ message: "Failed to load collaboration inbox" });
    }
  });

  app.post("/api/collaboration/inbox", requireAuth, async (req, res) => {
    try {
      if (!(await guardPublicParticipationAge(req, res))) return;

      const body = collabBodySchema.parse(req.body || {});
      const row = await appendCollaborationMessage({
        userId: req.user!.id,
        body: body.body,
        taskId: body.taskId ?? null,
        senderUserId: req.user!.id,
      });
      const assets = await linkAttachmentsToOwner({
        userId: req.user!.id,
        ownerType: "collab_message",
        ownerId: row.id,
        assetIds: body.attachmentAssetIds,
      });
      res.status(201).json({ ...row, attachments: toPublicAttachmentRefs(assets) });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to append message" });
    }
  });

  app.post("/api/collaboration/inbox/:id/read", requireAuth, async (req, res) => {
    try {
      const ok = await markCollaborationMessageRead(req.user!.id, req.params.id);
      if (!ok) return res.status(404).json({ message: "Message not found" });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark read" });
    }
  });

  const locationPlaceSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    lat: z.number().finite().optional().nullable(),
    lng: z.number().finite().optional().nullable(),
    radiusMeters: z.number().int().min(50).max(5000).optional(),
  });

  app.get("/api/location-places", requireAuth, async (req, res) => {
    try {
      const rows = await listUserLocationPlaces(req.user!.id);
      res.json({ places: rows });
    } catch (error) {
      res.status(500).json({ message: "Failed to list places" });
    }
  });

  app.post("/api/location-places", requireAuth, async (req, res) => {
    try {
      const body = locationPlaceSchema.parse(req.body || {});
      const row = await upsertUserLocationPlace(req.user!.id, body);
      if (!row) return res.status(404).json({ message: "Place not found" });
      res.status(201).json(row);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to save place" });
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
      const earnedIds = badges.map((b) => b.badgeId);
      res.json({
        wallet: toPublicWallet(wallet),
        badges: toPublicBadges(badges),
        rewards,
        transactions: toPublicCoinTransactions(txs),
        definitions: toPublicBadgeDefinitions(BADGE_DEFINITIONS, earnedIds),
        classificationStats,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get("/api/gamification/economy-diagnostics", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const tasks = await storage.getTasks(userId);
      const engagementDaily = Object.values(ENGAGEMENT).filter((e) => "dailyCap" in e) as Array<{
        reason: string;
        dailyCap: number;
      }>;
      const rewardsToday = await Promise.all(
        engagementDaily.map(async (entry) => ({
          reason: entry.reason,
          todayCount: await countCoinEventsToday(userId, entry.reason),
          dailyCap: entry.dailyCap,
        })),
      );
      const averagePScore =
        tasks.length > 0
          ? Number(
              (
                tasks.reduce((sum, task) => sum + Number(task.priorityScore ?? 0), 0) /
                tasks.length /
                10
              ).toFixed(2),
            )
          : 0;
      res.json({
        rewardsToday,
        averagePScore,
        pScoreScale: "0-10",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch economy diagnostics" });
    }
  });

  const offlineSkillUnlockSchema = z.object({
    skillKey: z.string().min(2).max(80),
  });

  const avatarEngageSchema = z.object({
    sourceType: z.enum(["task", "feedback", "post"]),
    sourceRef: z.string().min(2).max(160),
    text: z.string().min(1).max(2000),
    completed: z.boolean().default(false),
  });

  const avatarSpendSchema = z.object({
    coins: z.number().int().min(1).max(10000),
  });

  const avatarSkillUnlockSchema = z.object({
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

  app.get("/api/gamification/avatars", requireAuth, async (req, res) => {
    try {
      const [avatars, archetypeContinuum] = await Promise.all([
        getAvatarProfiles(req.user!.id),
        getPublicArchetypeContinuumForUser(req.user!.id),
      ]);
      res.json({ avatars, archetypeContinuum });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch avatars" });
    }
  });

  /**
   * Lightweight read-only feed of persona openers per avatar. The client
   * caches this (TanStack Query `staleTime: Infinity`) and picks a random
   * opener when rendering a feedback nudge so the dialog feels tied to a
   * companion instead of generic copy. See docs/FEEDBACK_AVATAR_NUDGES.md.
   */
  app.get("/api/gamification/avatar-voices", requireAuth, async (_req, res) => {
    try {
      const voices = listAvatarVoiceOpeners();
      res.json({ voices });
    } catch {
      res.status(500).json({ message: "Failed to fetch avatar voices" });
    }
  });

  app.post("/api/gamification/avatars/:avatarKey/engage", requireAuth, async (req, res) => {
    try {
      const payload = avatarEngageSchema.parse(req.body ?? {});
      const result = await engageAvatarMission({
        userId: req.user!.id,
        avatarKey: req.params.avatarKey,
        sourceType: payload.sourceType,
        sourceRef: payload.sourceRef,
        text: payload.text,
        completed: payload.completed,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to engage avatar mission" });
    }
  });

  app.post("/api/gamification/avatars/:avatarKey/spend", requireAuth, async (req, res) => {
    try {
      const { coins } = avatarSpendSchema.parse(req.body ?? {});
      const result = await spendCoinsForAvatarBoost(req.user!.id, req.params.avatarKey, coins);
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to spend coins on avatar" });
    }
  });

  app.get("/api/gamification/avatar-skills", requireAuth, async (req, res) => {
    try {
      const skills = await getAvatarSkillTree(req.user!.id);
      res.json(skills);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch avatar skills" });
    }
  });

  app.post("/api/gamification/avatar-skills/unlock", requireAuth, async (req, res) => {
    try {
      const { skillKey } = avatarSkillUnlockSchema.parse(req.body);
      const result = await unlockAvatarSkill(req.user!.id, skillKey);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      const skills = await getAvatarSkillTree(req.user!.id);
      res.json({ ...result, skills });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to unlock avatar skill" });
    }
  });

  // ── Classification categories + suggestions (protected) ───────────────────
  app.get("/api/classification/categories", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const custom = await listUserClassificationLabels(userId);
      res.json({
        builtIn: BUILT_IN_CLASSIFICATIONS.map((c) => ({ label: c.label, coins: c.coins })),
        custom: custom.map((c) => ({ id: c.id, label: c.label, coins: c.coins })),
      });
    } catch {
      res.status(500).json({ message: "Failed to load categories" });
    }
  });

  app.post("/api/classification/categories", requireAuth, async (req, res) => {
    try {
      const { name } = z.object({ name: z.string().min(2).max(48) }).parse(req.body ?? {});
      const row = await addUserClassificationLabel(req.user!.id, name);
      res.json(row);
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to add category" });
    }
  });

  const classificationSuggestionsSchema = z.object({
    activity: z.string().min(1).max(500),
    notes: z.string().max(5000).optional().default(""),
  });

  app.post("/api/classification/suggestions", requireAuth, async (req, res) => {
    try {
      const body = classificationSuggestionsSchema.parse(req.body ?? {});
      const { result, associations } = await classifyWithAssociations(body.activity, body.notes || "", {
        preferExternal: aiRuntimeFlags.externalClassifierEnabled,
      });
      const sourceTag =
        result.source === "external_api"
          ? "nodeweaver"
          : result.source === "priority_engine"
            ? "axtask"
            : "catalog";
      const suggestions = associations.map((a) => ({
        label: a.label,
        confidence: a.confidence,
        source: sourceTag,
      }));
      res.json({ suggestions });
      void trackAiRequestEvent({
        actorUserId: req.user!.id,
        route: "/api/classification/suggestions",
        method: "POST",
        statusCode: 200,
        source: result.source,
        confidence: result.confidence,
        fallbackLayer: result.fallbackLayer,
        disabledExternalClassifier: !aiRuntimeFlags.externalClassifierEnabled,
      });
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Suggestions failed" });
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
        preferExternal: payload.preferExternal && aiRuntimeFlags.externalClassifierEnabled,
      });
      res.json(result);
      void trackAiRequestEvent({
        actorUserId: req.user!.id,
        route: "/api/classification/classify",
        method: "POST",
        statusCode: 200,
        source: result.source,
        confidence: result.confidence,
        fallbackLayer: result.fallbackLayer,
        disabledExternalClassifier: !aiRuntimeFlags.externalClassifierEnabled,
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Classification failed" });
    }
  });

  // ── Feedback + attachments ────────────────────────────────────────────────
  const feedbackNudgeContextSchema = z
    .object({
      avatarKey: feedbackAvatarKeySchema.optional().nullable(),
      source: z.string().max(128).optional().nullable(),
      insightful: z.enum(["up", "down"]).optional().nullable(),
    })
    .optional();

  const feedbackSchema = z.object({
    message: z.string().min(5).max(5000),
    attachmentAssetIds: z.array(z.string().min(1)).max(10).default([]),
    screenshotMeta: z.array(z.object({
      fileName: z.string().optional(),
      mimeType: z.string().min(3),
      byteSize: z.number().int().nonnegative().max(ATTACHMENT_IMAGE_MAX_BYTES),
    })).max(10).default([]),
    nudgeContext: feedbackNudgeContextSchema,
  });

  const uploadUrlSchema = z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(3).max(128),
    byteSize: z.number().int().positive().max(ATTACHMENT_IMAGE_MAX_BYTES),
    kind: z.string().min(2).max(40).default("feedback"),
    taskId: z.string().optional(),
  });

  const feedbackProcessSchema = z.object({
    message: z.string().min(5).max(5000),
    attachmentCount: z.number().int().min(0).max(10).default(0),
  });

  app.post("/api/attachments/upload-url", requireAuth, attachmentUploadLimiter, async (req, res) => {
    try {
      const payload = uploadUrlSchema.parse(req.body);
      const canStore = await assertCanStoreAttachment(req.user!.id, payload.byteSize);
      if (!canStore.ok) {
        return res.status(413).json({ message: canStore.message });
      }

      const tempAsset = await createAttachmentAsset({
        userId: req.user!.id,
        kind: payload.kind,
        taskId: payload.taskId,
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

  app.put("/api/attachments/upload/:token", requireAuth, attachmentUploadLimiter, express.raw({ type: "*/*", limit: ATTACHMENT_UPLOAD_RAW_BODY_LIMIT }), async (req, res) => {
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

  /**
   * Paste-as-URL fallback. The client pastes an <img> URL or a copied image
   * link; we download via the SSRF-safe fetcher, re-host it, and return an
   * attachment_assets row. Never lets the SPA reach the third-party origin
   * at render time (so CSP does not have to be widened).
   */
  const importUrlSchema = z.object({
    url: z.string().min(8).max(2048),
    kind: z.string().min(2).max(40).default("paste"),
    taskId: z.string().optional(),
  });

  app.post(
    "/api/attachments/import-url",
    requireAuth,
    attachmentUploadLimiter,
    async (req, res) => {
      try {
        const payload = importUrlSchema.parse(req.body);
        let fetched;
        try {
          fetched = await fetchImageByUrl(payload.url);
        } catch (err) {
          if (err instanceof UrlFetchError) {
            await appendSecurityEvent({
              eventType: "attachment_url_rejected",
              actorUserId: req.user!.id,
              route: req.path,
              method: req.method,
              statusCode: 400,
              ipAddress: req.ip,
              userAgent: req.get("user-agent") || undefined,
              payload: { reason: err.reason, hop: err.hop },
            });
            return res.status(400).json({ message: `URL import rejected: ${err.reason}` });
          }
          throw err;
        }

        const canStore = await assertCanStoreAttachment(req.user!.id, fetched.byteSize);
        if (!canStore.ok) return res.status(413).json({ message: canStore.message });

        const fileName = `paste-${Date.now()}.${fetched.mimeType.split("/")[1] || "bin"}`;
        const asset = await createAttachmentAsset({
          userId: req.user!.id,
          kind: payload.kind,
          taskId: payload.taskId,
          fileName,
          mimeType: fetched.mimeType,
          byteSize: fetched.byteSize,
          metadataJson: JSON.stringify({
            status: "uploaded",
            source: "paste_url",
            finalUrl: fetched.finalUrl,
          }),
        });
        const storageKey = buildAttachmentStorageKey(req.user!.id, asset.id, fileName);
        await writeAttachmentObject(storageKey, fetched.buffer);
        await markAttachmentAssetUploaded(req.user!.id, asset.id, {
          status: "uploaded",
          source: "paste_url",
          storageKey,
          uploadedAt: new Date().toISOString(),
        });

        await appendSecurityEvent({
          eventType: "attachment_url_imported",
          actorUserId: req.user!.id,
          route: req.path,
          method: req.method,
          statusCode: 201,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
          payload: { assetId: asset.id, byteSize: fetched.byteSize },
        });

        res.status(201).json({ assetId: asset.id, mimeType: fetched.mimeType, byteSize: fetched.byteSize });
      } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
        if (error instanceof Error) return res.status(400).json({ message: error.message });
        res.status(500).json({ message: "URL import failed" });
      }
    },
  );

  /**
   * GIF provider search proxy. Keeps API keys on the server and normalises
   * upstream shapes to a fixed `GifSearchResult` contract. The `previewUrl`
   * field is safe to render via the existing img-src CSP; when the user
   * selects one, the SPA calls /api/gif/resolve which re-hosts the bytes.
   */
  const gifSearchQuerySchema = z.object({
    q: z.string().min(1).max(80),
    provider: z.enum(["giphy", "tenor"]).default("giphy"),
    limit: z.coerce.number().int().min(1).max(24).optional(),
  });

  app.get("/api/gif/search", requireAuth, gifSearchLimiter, async (req, res) => {
    try {
      const params = gifSearchQuerySchema.parse(req.query);
      if (!hasAnyGifProvider()) {
        return res.status(503).json({ message: "GIF search is not configured on this deployment" });
      }
      const results = await searchGifs(params.provider as GifSearchProvider, {
        q: params.q,
        limit: params.limit,
      });
      res.json({ provider: params.provider, results });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      if (error instanceof GifSearchConfigError) {
        return res.status(503).json({ message: error.message });
      }
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "GIF search failed" });
    }
  });

  /**
   * Re-hosts a picked GIF so the rendered chat bubble never hotlinks
   * giphy.com / tenor.com. Body is validated+downloaded through the
   * SSRF-safe fetcher, then stored just like a regular paste.
   */
  const gifResolveSchema = z.object({
    provider: z.enum(["giphy", "tenor"]),
    id: z.string().min(1).max(128),
    originalUrl: z.string().url().max(2048),
  });

  app.post("/api/gif/resolve", requireAuth, gifSearchLimiter, async (req, res) => {
    try {
      const payload = gifResolveSchema.parse(req.body);
      let fetched;
      try {
        fetched = await fetchImageByUrl(payload.originalUrl);
      } catch (err) {
        if (err instanceof UrlFetchError) {
          await appendSecurityEvent({
            eventType: "gif_resolve_rejected",
            actorUserId: req.user!.id,
            route: req.path,
            method: req.method,
            statusCode: 400,
            ipAddress: req.ip,
            userAgent: req.get("user-agent") || undefined,
            payload: { reason: err.reason, provider: payload.provider },
          });
          return res.status(400).json({ message: `GIF rejected: ${err.reason}` });
        }
        throw err;
      }

      const canStore = await assertCanStoreAttachment(req.user!.id, fetched.byteSize);
      if (!canStore.ok) return res.status(413).json({ message: canStore.message });

      const fileName = `${payload.provider}-${payload.id}.gif`;
      const asset = await createAttachmentAsset({
        userId: req.user!.id,
        kind: "gif",
        fileName,
        mimeType: fetched.mimeType,
        byteSize: fetched.byteSize,
        metadataJson: JSON.stringify({
          status: "uploaded",
          source: `gif_${payload.provider}`,
          providerId: payload.id,
        }),
      });
      const storageKey = buildAttachmentStorageKey(req.user!.id, asset.id, fileName);
      await writeAttachmentObject(storageKey, fetched.buffer);
      await markAttachmentAssetUploaded(req.user!.id, asset.id, {
        status: "uploaded",
        source: `gif_${payload.provider}`,
        storageKey,
        uploadedAt: new Date().toISOString(),
      });

      res.status(201).json({ assetId: asset.id, mimeType: fetched.mimeType, byteSize: fetched.byteSize });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "GIF resolve failed" });
    }
  });

  app.post("/api/feedback", requireAuth, async (req, res) => {
    try {
      if (!(await guardPublicParticipationAge(req, res))) return;

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

      try {
        await recordArchetypeSignal({
          userId: req.user!.id,
          signal: "feedback_submitted",
          avatarKey: parsed.nudgeContext?.avatarKey ?? null,
          source: parsed.nudgeContext?.source ?? null,
          insightful: parsed.nudgeContext?.insightful ?? null,
          sentiment: analysis.sentiment,
          route: req.path,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
      } catch (err) {
        console.warn("[archetype] failed to record feedback signal", err);
      }

      const feedbackReward = await tryCappedCoinAward({
        userId: req.user!.id,
        reason: ENGAGEMENT.feedbackSubmission.reason,
        amount: ENGAGEMENT.feedbackSubmission.amount,
        dailyCap: ENGAGEMENT.feedbackSubmission.dailyCap,
        details: `Feedback (${parsed.message.slice(0, 80)}${parsed.message.length > 80 ? "…" : ""})`,
      });

      const feedbackCount = await getFeedbackSubmissionCount(req.user!.id);
      const feedbackBadgesEarned = await awardFeedbackBadges(req.user!.id, feedbackCount);

      res.status(201).json({
        message: "Feedback submitted",
        attachments: totalAttachments,
        analysis,
        feedbackReward,
        feedbackBadgesEarned,
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

  // ── E2EE: device keys + direct DMs (ciphertext only on server) ─────────────
  app.post("/api/e2ee/devices", requireAuth, async (req, res) => {
    try {
      const body = z
        .object({
          deviceId: z.string().min(8).max(160),
          publicKeySpki: z.string().min(32).max(20000),
          label: z.string().max(120).optional().nullable(),
        })
        .parse(req.body);
      await upsertUserDeviceKey({
        userId: req.user!.id,
        deviceId: body.deviceId,
        publicKeySpki: body.publicKeySpki,
        label: body.label ?? null,
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to register device key" });
    }
  });

  app.get("/api/e2ee/devices", requireAuth, async (req, res) => {
    try {
      const devices = await listUserDeviceKeysPublic(req.user!.id);
      res.json({ devices });
    } catch {
      res.status(500).json({ message: "Failed to list devices" });
    }
  });

  app.get("/api/e2ee/conversations/:id/peer-devices", requireAuth, async (req, res) => {
    try {
      const ok = await assertDmMember(req.params.id, req.user!.id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      const peerUserId = await getOtherMemberUserId(req.params.id, req.user!.id);
      if (!peerUserId) return res.status(400).json({ message: "Invalid conversation" });
      const devices = await listUserDeviceKeysPublic(peerUserId);
      res.json({ devices });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to list peer devices" });
    }
  });

  app.get("/api/dm/public-identity", requireAuth, async (req, res) => {
    try {
      const share = await getPublicDmSharePack(req.user!.id);
      if (!share) return res.status(404).json({ message: "User not found" });
      res.json({
        publicHandle: share.publicHandle,
        publicDmToken: share.publicDmToken,
      });
    } catch {
      res.status(500).json({ message: "Failed to load DM identity" });
    }
  });

  app.post("/api/dm/conversations", requireAuth, async (req, res) => {
    try {
      if (!(await guardPublicParticipationAge(req, res))) return;
      const parsed = z
        .object({
          peerHandle: z.string().min(2).max(64).optional(),
          peerDmToken: z.string().min(16).max(128).optional(),
        })
        .refine((v) => Boolean(v.peerHandle?.trim() || v.peerDmToken?.trim()), {
          message: "Provide a peer handle or invite token",
        })
        .parse(req.body);
      const peerUserId = await resolvePeerUserIdByPublicIdentifier({
        peerHandle: parsed.peerHandle ?? null,
        peerDmToken: parsed.peerDmToken ?? null,
      });
      if (!peerUserId) return res.status(404).json({ message: "Peer not found" });
      if (peerUserId === req.user!.id) {
        return res.status(400).json({ message: "Cannot start a conversation with yourself" });
      }
      const conversationId = await createDirectDmConversation(req.user!.id, peerUserId);
      res.status(201).json({ conversationId });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/dm/conversations", requireAuth, async (req, res) => {
    try {
      const conversations = await listDmConversationsForUser(req.user!.id) as PublicDmConversation[];
      res.json({ conversations });
    } catch {
      res.status(500).json({ message: "Failed to list conversations" });
    }
  });

  app.get("/api/dm/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const ok = await assertDmMember(req.params.id, req.user!.id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      const rows = await listDmMessages(req.params.id, 200);
      const messages: PublicDmMessage[] = [...rows].reverse().map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        direction: m.senderUserId === req.user!.id ? "out" : "in",
        senderPubSpkiB64: m.senderPubSpkiB64,
        recipientPubSpkiB64: m.recipientPubSpkiB64,
        ciphertextB64: m.ciphertextB64,
        nonceB64: m.nonceB64,
        contentEncoding: m.contentEncoding,
        createdAt: m.createdAt ? m.createdAt.toISOString() : null,
      }));
      res.json({ messages });
    } catch {
      res.status(500).json({ message: "Failed to load messages" });
    }
  });

  app.post("/api/dm/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      if (!(await guardPublicParticipationAge(req, res))) return;
      const DM_B64_FIELD_MAX = 512 * 1024;
      const parsed = z
        .object({
          ciphertextB64: z.string().min(1).max(DM_B64_FIELD_MAX),
          nonceB64: z.string().min(1).max(256),
          senderPubSpkiB64: z.string().min(1).max(DM_B64_FIELD_MAX),
          recipientPubSpkiB64: z.string().min(1).max(DM_B64_FIELD_MAX),
          contentEncoding: z.string().max(32).optional(),
        })
        .parse(req.body);
      const ok = await assertDmMember(req.params.id, req.user!.id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      const recipientUserId = await getOtherMemberUserId(req.params.id, req.user!.id);
      if (!recipientUserId) return res.status(400).json({ message: "Invalid conversation" });
      const row = await insertDmMessage({
        conversationId: req.params.id,
        senderUserId: req.user!.id,
        recipientUserId,
        senderPubSpkiB64: parsed.senderPubSpkiB64,
        recipientPubSpkiB64: parsed.recipientPubSpkiB64,
        ciphertextB64: parsed.ciphertextB64,
        nonceB64: parsed.nonceB64,
        contentEncoding: parsed.contentEncoding,
      });
      res.status(201).json({
        id: row.id,
        conversationId: row.conversationId,
        direction: "out",
        senderPubSpkiB64: row.senderPubSpkiB64,
        recipientPubSpkiB64: row.recipientPubSpkiB64,
        ciphertextB64: row.ciphertextB64,
        nonceB64: row.nonceB64,
        contentEncoding: row.contentEncoding,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      } satisfies PublicDmMessage);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ── Archetype nudge lifecycle events ─────────────────────────────────────
  const archetypeNudgeEventSchema = z.object({
    kind: z.enum(["shown", "dismissed", "opened"]),
    avatarKey: feedbackAvatarKeySchema,
    source: z.string().max(128).optional().nullable(),
    insightful: z.enum(["up", "down"]).optional().nullable(),
  });

  app.post("/api/archetypes/nudge-event", requireAuth, async (req, res) => {
    try {
      const payload = archetypeNudgeEventSchema.parse(req.body);
      const signal: ArchetypeSignalKind =
        payload.kind === "shown" ? "nudge_shown"
          : payload.kind === "dismissed" ? "nudge_dismissed"
            : "nudge_opened";
      const result = await recordArchetypeSignal({
        userId: req.user!.id,
        signal,
        avatarKey: payload.avatarKey,
        source: payload.source ?? null,
        insightful: payload.insightful ?? null,
        route: req.path,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      if (!result) return res.status(400).json({ message: "Unresolvable avatar key" });
      res.status(202).json({ recorded: true });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to record nudge event" });
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

  // ── Task attachment endpoints ─────────────────────────────────────────────

  app.get("/api/tasks/:taskId/attachments", requireAuth, async (req, res) => {
    try {
      const assets = await getTaskAttachments(req.user!.id, req.params.taskId);
      res.json(assets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task attachments" });
    }
  });

  app.post("/api/tasks/:taskId/attachments/link", requireAuth, async (req, res) => {
    try {
      const { assetId } = z.object({ assetId: z.string().min(1) }).parse(req.body);
      const linked = await linkAttachmentToTask(req.user!.id, assetId, req.params.taskId);
      if (!linked) return res.status(404).json({ message: "Attachment not found" });
      res.json(linked);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to link attachment to task" });
    }
  });

  app.get("/api/attachments/:assetId/download", requireAuth, async (req, res) => {
    try {
      const asset = await getAttachmentAssetById(req.user!.id, req.params.assetId);
      if (!asset) return res.status(404).json({ message: "Attachment not found" });
      const meta = asset.metadataJson ? JSON.parse(asset.metadataJson) : {};
      const storageKey = asset.storageKey || meta.storageKey;
      if (!storageKey) return res.status(404).json({ message: "No storage key for attachment" });
      const bytes = await readAttachmentObject(storageKey);
      if (!bytes) return res.status(404).json({ message: "Attachment file not found" });
      res.setHeader("Content-Type", asset.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${(asset.fileName || "download").replace(/"/g, "_")}"`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(bytes);
    } catch (error) {
      res.status(500).json({ message: "Failed to download attachment" });
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

      const validMfa = await verifyMfaChallengeOrTotp(req.user!.id, challengeId, code, MFA_PURPOSES.INVOICE_ISSUE);
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

      const validMfa = await verifyMfaChallengeOrTotp(req.user!.id, challengeId, code, MFA_PURPOSES.INVOICE_CONFIRM_PAYMENT);
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

      const validMfa = await verifyMfaChallengeOrTotp(
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

  const DATA_EXPORT_STEP_UP_TTL_MS = 60 * 60 * 1000;

  function requireDataExportStepUp(req: Request, res: Response, next: NextFunction) {
    if (process.env.NODE_ENV !== "production") {
      return next();
    }
    const exp = req.session.dataExportStepUp?.expiresAt;
    if (typeof exp === "number" && exp > Date.now()) {
      return next();
    }
    return res.status(403).json({ message: "Verify your email before downloading or importing a JSON backup" });
  }

  app.get("/api/account/data-export-step-up-status", requireAuth, async (req, res) => {
    try {
      const stepUpRequired = process.env.NODE_ENV === "production";
      const exp = req.session.dataExportStepUp?.expiresAt;
      const stepUpSatisfied =
        !stepUpRequired || (typeof exp === "number" && exp > Date.now());
      const expiresAt = typeof exp === "number" && exp > Date.now() ? exp : null;
      res.json({ stepUpRequired, stepUpSatisfied, expiresAt });
    } catch {
      res.status(500).json({ message: "Failed to load verification status" });
    }
  });

  app.post("/api/account/data-export-step-up", requireAuth, async (req, res) => {
    try {
      const { challengeId, code } = z
        .object({
          challengeId: z.string().min(1),
          code: z.string().trim().length(6),
        })
        .parse(req.body);
      const ok = await verifyMfaChallengeOrTotp(
        req.user!.id,
        challengeId,
        code,
        MFA_PURPOSES.ACCOUNT_DATA_EXPORT,
      );
      if (!ok) {
        await appendSecurityEvent({
          eventType: "mfa_verify_failed",
          actorUserId: req.user!.id,
          route: req.path,
          method: req.method,
          statusCode: 403,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
          payload: { context: "account_data_export_step_up" },
        });
        return res.status(403).json({ message: "Invalid or expired code" });
      }
      req.session.dataExportStepUp = { expiresAt: Date.now() + DATA_EXPORT_STEP_UP_TTL_MS };
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
      await appendSecurityEvent({
        eventType: "account_data_export_step_up_ok",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to verify" });
    }
  });

  app.get("/api/account/export", requireAuth, requireDataExportStepUp, async (req, res) => {
    try {
      const bundle = await buildUserExportBundle(req.user!.id);
      await appendSecurityEvent({
        eventType: "account_json_export",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: { taskCount: bundle.data.tasks?.length ?? 0 },
      });
      res.json(bundle);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to export account backup" });
    }
  });

  const isFullUserBundle = (bundle: unknown): bundle is import("./migration/export").ExportBundle => {
    if (!bundle || typeof bundle !== "object") return false;
    const record = bundle as Record<string, unknown>;
    const metadata = (record.metadata || {}) as Record<string, unknown>;
    const data = (record.data || {}) as Record<string, unknown>;
    return (
      metadata.exportMode === "user" &&
      (Array.isArray(data.tasks) || Array.isArray(data.userBadges) || Array.isArray(data.coinTransactions))
    );
  };

  app.post("/api/account/import/challenge", requireAuth, requireDataExportStepUp, async (req, res) => {
    try {
      // Full user export bundles use migration import and do not require legacy ownership quiz prompts.
      if (isFullUserBundle(req.body?.bundle)) {
        return res.json({
          ownershipQuizRequired: false,
          tasksFingerprint: "",
          questionCount: 0,
          questions: [],
        });
      }
      const ch = buildImportChallenge(req.body?.bundle);
      if (ch.message) {
        return res.status(400).json(ch);
      }
      res.json(ch);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to build import challenge" });
    }
  });

  app.post("/api/account/import", requireAuth, requireDataExportStepUp, async (req, res) => {
    try {
      const body = z
        .object({
          bundle: z.unknown(),
          dryRun: z.boolean(),
          importOwnershipAnswers: z
            .array(
              z.object({
                questionId: z.string(),
                selectedIndex: z.number().int(),
              }),
            )
            .optional(),
        })
        .parse(req.body);
      if (isFullUserBundle(body.bundle)) {
        const validation = validateBundle(body.bundle);
        if (validation.errors.length > 0) {
          return res.status(400).json({ message: "Bundle validation failed", errors: validation.errors });
        }
        const result = await importUserBundle(body.bundle, req.user!.id, { dryRun: body.dryRun });
        return res.json(result);
      }
      const result = await runAccountImport({
        userId: req.user!.id,
        bundle: body.bundle,
        dryRun: body.dryRun,
        importOwnershipAnswers: body.importOwnershipAnswers,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to import account backup" });
    }
  });

  function isIsoCalendarDateStrict(s: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, mo, d] = s.split("-").map((x) => parseInt(x, 10));
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return false;
    if (y < 1900 || y > 2100) return false;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }

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

  const ADMIN_STEP_UP_TTL_MS = 60 * 60 * 1000;

  function requireAdminStepUp(req: Request, res: Response, next: NextFunction) {
    if (process.env.NODE_ENV !== "production") {
      return next();
    }
    const exp = req.session.adminStepUp?.expiresAt;
    if (typeof exp === "number" && exp > Date.now()) {
      return next();
    }
    return res.status(403).json({ message: "Admin step-up required" });
  }

  app.get("/api/admin/repo-inventory", requireAdmin, requireAdminStepUp, async (_req, res) => {
    try {
      const { stdout: branches } = await execFileAsync("git", ["branch", "-a", "--no-color"], {
        cwd: process.cwd(),
        maxBuffer: 2_000_000,
      });
      const { stdout: recent } = await execFileAsync("git", ["log", "--oneline", "-25", "--no-color"], {
        cwd: process.cwd(),
        maxBuffer: 512_000,
      });
      res.json({
        branches: branches.slice(0, 24_000),
        recentCommits: recent.slice(0, 24_000),
      });
    } catch {
      res.status(500).json({ message: "Git inventory unavailable" });
    }
  });

  app.get("/api/admin/classification/category-review-triggers", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
      const filter = statusParam && (CATEGORY_REVIEW_STATUSES as readonly string[]).includes(statusParam)
        ? { status: statusParam as CategoryReviewStatus }
        : undefined;
      const rows = await getCategoryReviewTriggers(filter);
      res.json({ triggers: rows });
    } catch (error) {
      console.error("Admin review-triggers fetch error:", error);
      res.status(500).json({ message: "Failed to fetch review triggers" });
    }
  });

  app.get("/api/admin/classification/category-review-triggers/:id/disputes", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const trigger = await getCategoryReviewTriggerById(req.params.id);
      if (!trigger) {
        return res.status(404).json({ message: "Trigger not found" });
      }
      const disputes = await getDisputesByCategory(trigger.originalCategory, 100);
      res.json({
        trigger,
        disputes: disputes.filter((d) => d.suggestedCategory === trigger.suggestedCategory),
      });
    } catch (error) {
      console.error("Admin trigger disputes fetch error:", error);
      res.status(500).json({ message: "Failed to fetch trigger disputes" });
    }
  });

  app.post("/api/admin/classification/category-review-triggers/:id/resolve", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const resolveSchema = z.object({ outcome: z.string().trim().min(1).max(200) });
      const parsed = resolveSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "outcome is required (<=200 chars)" });
      }
      const resolved = await resolveCategoryReview(req.params.id, req.user!.id, parsed.data.outcome);
      if (!resolved) {
        return res.status(404).json({ message: "Trigger not found" });
      }
      await logSecurityEvent(
        "classification_category_resolved",
        req.user!.id,
        undefined,
        req.ip,
        `Resolved ${resolved.originalCategory} -> ${resolved.suggestedCategory}: ${parsed.data.outcome}`,
      );
      res.json({ trigger: resolved });
    } catch (error) {
      console.error("Admin resolve trigger error:", error);
      res.status(500).json({ message: "Failed to resolve trigger" });
    }
  });

  const adminArchetypePollCreateSchema = z.object({
    title: z.string().min(4).max(200),
    body: z.string().max(2000).optional().nullable(),
    authorAvatarKey: feedbackAvatarKeySchema,
    optionLabels: z.array(z.string().min(1).max(200)).min(2).max(8),
    durationDays: z.number().int().min(1).max(30).optional().default(7),
  });

  app.post("/api/admin/archetype-polls", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const parsed = adminArchetypePollCreateSchema.parse(req.body);
      const now = new Date();
      const closesAt = new Date(now.getTime() + parsed.durationDays * 24 * 60 * 60 * 1000);
      const { poll, options } = await createArchetypePollWithOptions({
        title: parsed.title,
        body: parsed.body ?? null,
        authorAvatarKey: parsed.authorAvatarKey,
        opensAt: now,
        closesAt,
        options: parsed.optionLabels.map((label, i) => ({ label, sortOrder: i })),
      });
      await logSecurityEvent(
        "admin_archetype_poll_created",
        req.user!.id,
        undefined,
        req.ip,
        `Poll ${poll.id}: ${poll.title.slice(0, 80)}`,
      );
      res.status(201).json({
        id: poll.id,
        title: poll.title,
        optionCount: options.length,
        closesAt: poll.closesAt?.toISOString() ?? null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      console.error("Admin archetype poll create error:", error);
      res.status(500).json({ message: "Failed to create poll" });
    }
  });

  app.get("/api/admin/step-up-status", requireAdmin, async (req, res) => {
    try {
      const stepUpRequired = process.env.NODE_ENV === "production";
      const exp = req.session.adminStepUp?.expiresAt;
      const stepUpSatisfied =
        !stepUpRequired || (typeof exp === "number" && exp > Date.now());
      const expiresAt = typeof exp === "number" && exp > Date.now() ? exp : null;
      res.json({
        stepUpRequired,
        stepUpSatisfied,
        expiresAt,
      });
    } catch {
      res.status(500).json({ message: "Failed to load admin step-up status" });
    }
  });

  app.post("/api/admin/step-up", requireAdmin, async (req, res) => {
    try {
      const { challengeId, code } = z
        .object({
          challengeId: z.string().min(1),
          code: z.string().trim().length(6),
        })
        .parse(req.body);

      const ok = await verifyMfaChallengeOrTotp(
        req.user!.id,
        challengeId,
        code,
        MFA_PURPOSES.ADMIN_STEP_UP,
      );
      if (!ok) {
        await appendSecurityEvent({
          eventType: "mfa_verify_failed",
          actorUserId: req.user!.id,
          route: req.path,
          method: req.method,
          statusCode: 403,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
          payload: { context: "admin_step_up" },
        });
        return res.status(403).json({ message: "Invalid or expired code" });
      }

      req.session.adminStepUp = { expiresAt: Date.now() + ADMIN_STEP_UP_TTL_MS };
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
      await appendSecurityEvent({
        eventType: "admin_step_up_ok",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to complete admin step-up" });
    }
  });

  app.get("/api/admin/users", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const userList = await getAllUsers();
      res.json(userList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:userId/ban", requireAdmin, requireAdminStepUp, async (req, res) => {
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

  app.post("/api/admin/users/:userId/unban", requireAdmin, requireAdminStepUp, async (req, res) => {
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

  app.post("/api/admin/ban/:userId", requireAdmin, requireAdminStepUp, async (req, res) => {
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

  app.post("/api/admin/unban/:userId", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const { userId } = req.params;
      const success = await unbanUser(userId, req.user!.id, req.ip);
      if (!success) return res.status(404).json({ message: "User not found" });
      res.json({ message: "User has been unbanned" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unban user" });
    }
  });

  app.get("/api/admin/security-logs", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const logs = await getSecurityLogs(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch security logs" });
    }
  });

  app.get("/api/admin/security-events", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000);
      const events = await getSecurityEvents(limit);
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch security events" });
    }
  });

  app.post("/api/admin/security-alerts/analyze", requireAdmin, requireAdminStepUp, async (_req, res) => {
    try {
      const result = await analyzeAndCreateSecurityAlerts();
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze security alerts" });
    }
  });

  app.get("/api/admin/security-alerts", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000);
      const alerts = await getSecurityAlerts(limit);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch security alerts" });
    }
  });

  app.get("/api/admin/feedback-inbox", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
      const items = await listFeedbackInbox(limit);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch feedback inbox" });
    }
  });

  app.get("/api/admin/ai/runtime-controls", requireAdmin, requireAdminStepUp, async (_req, res) => {
    res.json({
      externalClassifierEnabled: aiRuntimeFlags.externalClassifierEnabled,
    });
  });

  app.post("/api/admin/ai/runtime-controls", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const payload = z.object({
        externalClassifierEnabled: z.boolean(),
      }).parse(req.body || {});
      aiRuntimeFlags.externalClassifierEnabled = payload.externalClassifierEnabled;
      await appendSecurityEvent({
        eventType: "admin_ai_runtime_controls_updated",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        payload,
      });
      res.json({
        ok: true,
        externalClassifierEnabled: aiRuntimeFlags.externalClassifierEnabled,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request body" });
      }
      res.status(500).json({ message: "Failed to update AI runtime controls" });
    }
  });

  app.get("/api/admin/analytics/overview", requireAdmin, requireAdminStepUp, async (_req, res) => {
    try {
      const users = await getAllUsers();
      const tasksByUser = await Promise.all(users.map((u) => storage.getTasks(u.id)));
      const allTasks = tasksByUser.flat();
      const completedTasks = allTasks.filter((t) => t.status === "completed");

      const feedback = await getFeedbackInsightsGlobal(2000);
      const recentEvents = await getSecurityEvents(3000);
      const now = new Date();
      const activeUsersSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const activeUserIds24h = new Set(
        recentEvents
          .filter((event) => {
            if (!event.actorUserId || !event.createdAt) return false;
            return new Date(event.createdAt) >= activeUsersSince;
          })
          .map((event) => event.actorUserId as string),
      );
      const activeUsers24h = activeUserIds24h.size;

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
      const aiWindowStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const aiEvents = recentEvents.filter((event) => {
        if (event.eventType !== "ai_request" || !event.createdAt) return false;
        return new Date(event.createdAt) >= aiWindowStart;
      });
      const aiCostByDay = new Map<string, { date: string; estimatedCostCents: number; requests: number; disabledCount: number }>();
      let aiCost7dCents = 0;
      for (const event of aiEvents) {
        const dateKey = toIsoDate(new Date(event.createdAt!));
        const parsedPayload = (() => {
          if (!event.payloadJson) return {};
          try {
            return JSON.parse(event.payloadJson) as Record<string, unknown>;
          } catch {
            return {};
          }
        })();
        const eventCostCentsRaw = parsedPayload.estimatedCostCents;
        const eventCostCents = typeof eventCostCentsRaw === "number" ? Math.max(0, eventCostCentsRaw) : 0;
        const disabled = parsedPayload.disabledExternalClassifier === true;
        const row = aiCostByDay.get(dateKey) || {
          date: dateKey,
          estimatedCostCents: 0,
          requests: 0,
          disabledCount: 0,
        };
        row.estimatedCostCents += eventCostCents;
        row.requests += 1;
        if (disabled) row.disabledCount += 1;
        aiCostByDay.set(dateKey, row);
        if (new Date(event.createdAt!) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) {
          aiCost7dCents += eventCostCents;
        }
      }
      const aiCostTrend = Array.from({ length: 14 }, (_, idx) => {
        const d = new Date(now);
        d.setDate(now.getDate() - (13 - idx));
        const key = toIsoDate(d);
        return aiCostByDay.get(key) || {
          date: key,
          estimatedCostCents: 0,
          requests: 0,
          disabledCount: 0,
        };
      });

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
          aiCost7dCents,
        }),
        pretext: buildAdminPretext({
          completionRate,
          urgentFeedback: feedback.urgentCount,
          requestVolumeHour,
          completionDelta,
        }),
        activeUsers24h,
        isSingleActiveUser: activeUsers24h === 1,
        activeWindowHours: 24,
        aiCosts: {
          estimatedCost7dCents: aiCost7dCents,
          estimatedCost14dCents: aiCostTrend.reduce((sum, row) => sum + row.estimatedCostCents, 0),
          requests14d: aiCostTrend.reduce((sum, row) => sum + row.requests, 0),
        },
        aiCostTrend,
        aiRuntime: {
          externalClassifierEnabled: aiRuntimeFlags.externalClassifierEnabled,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch admin analytics overview" });
    }
  });

  app.post("/api/admin/feedback-inbox/:feedbackEventId/review", requireAdmin, requireAdminStepUp, async (req, res) => {
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

  app.post("/api/admin/feedback-inbox/review-bulk", requireAdmin, requireAdminStepUp, async (req, res) => {
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

  app.get("/api/admin/storage", requireAdmin, requireAdminStepUp, async (req, res) => {
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

  app.post("/api/admin/usage/capture", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const userId = typeof req.body?.userId === "string" ? req.body.userId : req.user!.id;
      await captureUsageSnapshot(userId);
      res.status(201).json({ message: "Usage snapshot captured" });
    } catch (error) {
      res.status(500).json({ message: "Failed to capture usage snapshot" });
    }
  });

  app.get("/api/admin/usage", requireAdmin, requireAdminStepUp, async (_req, res) => {
    try {
      const usage = await getUsageOverview();
      res.json(usage);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch usage overview" });
    }
  });

  app.get("/api/admin/performance/heuristics", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const hours = Math.min(Math.max(Number(req.query.hours || 24), 1), 168);
      const actorUserId = typeof req.query.actorUserId === "string" ? req.query.actorUserId : null;
      const data = await getApiPerformanceHeuristics({ windowHours: hours, actorUserId });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to load API performance heuristics" });
    }
  });

  // Neon / Postgres size gauge for the Admin > Performance tab. Mirrors
  // the same number the deploy-time capacity gate checks
  // (scripts/deploy/check-db-capacity.mjs), so operators see headroom
  // trending toward the ceiling long before a migration trips 53100.
  app.get("/api/admin/db-size", requireAdmin, requireAdminStepUp, async (_req, res) => {
    try {
      const report = await getDbSizeCached();
      res.json(report);
    } catch (error) {
      res.status(500).json({ message: "Failed to read database size" });
    }
  });

  // ─── Admin > Storage granularity ───────────────────────────────────
  //
  // These endpoints power the Storage tab (client/src/components/admin/
  // storage/*). They go a level deeper than the whole-DB gauge above:
  // per-table and per-domain byte counts, the top-N storage-heavy users
  // (hashed), a DB-size trend from db_size_snapshots, and a dry-run
  // preview plus an explicit run trigger for the retention worker.
  //
  // Everything is read-only except POST /api/admin/retention/run, which
  // is audited via logSecurityEvent("retention_prune_manual", ...).

  app.get("/api/admin/db-storage/tables", requireAdmin, requireAdminStepUp, async (_req, res) => {
    try {
      const result = await listTableBytes();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to read per-table storage" });
    }
  });

  app.get("/api/admin/db-storage/domains", requireAdmin, requireAdminStepUp, async (_req, res) => {
    try {
      const result = await listDomainRollup();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to read per-domain storage rollup" });
    }
  });

  app.get("/api/admin/db-storage/top-users", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const kindParam = String(req.query.kind || "attachments") as TopUserKind;
      const kind: TopUserKind = kindParam === "tasks" ? "tasks" : "attachments";
      const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
      const result = await listTopUsers(kind, limit);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to read top-users-by-storage" });
    }
  });

  app.get("/api/admin/db-size/history", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days || 30), 1), 365);
      const points = await listDbSizeHistory(days);
      res.json({ points, days });
    } catch (error) {
      res.status(500).json({ message: "Failed to read DB size history" });
    }
  });

  app.get("/api/admin/retention/preview", requireAdmin, requireAdminStepUp, async (_req, res) => {
    try {
      const result = await previewRetentionPrune();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to compute retention preview" });
    }
  });

  app.post(
    "/api/admin/retention/run",
    adminRetentionRunLimiter,
    requireAdmin,
    requireAdminStepUp,
    async (req, res) => {
      try {
        const result = await runRetentionPruneOnce();
        // Audit the manual trigger so operator actions are traceable in
        // security_logs alongside the scheduled 24h tick output. Follows
        // the OPERATOR_COIN_GRANTS audit pattern — owner-level write, not
        // a generic admin action.
        try {
          await logSecurityEvent(
            "retention_prune_manual",
            req.user?.id,
            undefined,
            req.ip,
            JSON.stringify({
              securityEventsDeleted: result.securityEventsDeleted,
              securityLogsDeleted: result.securityLogsDeleted,
              usageSnapshotsDeleted: result.usageSnapshotsDeleted,
              passwordResetTokensDeleted: result.passwordResetTokensDeleted,
              dbSizeSnapshotsDeleted: result.dbSizeSnapshotsDeleted,
              durationMs: result.durationMs,
              errors: result.errors.length,
            }),
          );
        } catch (auditErr) {
          // Audit write failure must not hide the action result from the
          // operator — log and keep going.
          console.warn("[retention_prune_manual] audit log failed:", (auditErr as Error)?.message);
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Retention prune failed" });
      }
    },
  );

  app.get("/api/admin/premium/retention", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days || 30), 7), 180);
      const metrics = await getPremiumRetentionMetrics(days);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch premium retention metrics" });
    }
  });

  app.post("/api/admin/storage/retention-dry-run", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {
      const retentionDays = Number(req.body?.retentionDays || 90);
      const result = await runRetentionDryRun(req.user!.id, retentionDays);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to run retention dry-run" });
    }
  });

  app.post("/api/admin/storage/attachment-retention-run", requireAdmin, requireAdminStepUp, async (req, res) => {
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

  // ════════════════════════════════════════════════════════════════════════
  //  Billing Bridge routes (protected — invokes Python billing bridge CLI)
  // ════════════════════════════════════════════════════════════════════════

  app.use("/api/billing-bridge", apiLimiter);

  app.post("/api/billing-bridge/run", requireAuth, async (req, res) => {
    try {
      const { spawn } = await import("child_process");
      const path = await import("path");
      const fs = await import("fs/promises");

      const bridgeRoot = path.resolve(__dirname, "../tools/billing_bridge");
      const configDir = path.join(bridgeRoot, "config");
      const outDir = path.join(bridgeRoot, "output", `run_${Date.now()}`);

      // Validate config files exist
      const aliasPath = path.join(configDir, "person_aliases.csv");
      const outwardPath = path.join(configDir, "outward_assignment_map.csv");
      const sitePath = path.join(configDir, "site_map.csv");

      for (const f of [aliasPath, outwardPath, sitePath]) {
        try { await fs.access(f); } catch {
          return res.status(400).json({ message: `Missing config file: ${f}` });
        }
      }

      // Expect source file paths in request body — sanitize against path traversal
      const { taskTracker, roster, manager, month } = req.body;
      if (!taskTracker || !roster || !manager) {
        return res.status(400).json({
          message: "taskTracker, roster, and manager file paths are required",
        });
      }

      // Only allow filenames (no directory separators) and resolve against a fixed base dir
      const allowedBaseDir = path.resolve(__dirname, "../my_corporate_workflow_files");
      const safePath = (input: string): string => {
        const basename = path.basename(input); // strip any directory components
        const resolved = path.resolve(allowedBaseDir, basename);
        if (!resolved.startsWith(allowedBaseDir + path.sep) && resolved !== allowedBaseDir) {
          throw new Error(`Invalid file path: ${input}`);
        }
        return resolved;
      };

      let safeTaskTracker: string, safeRoster: string, safeManager: string;
      try {
        safeTaskTracker = safePath(taskTracker);
        safeRoster = safePath(roster);
        safeManager = safePath(manager);
      } catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : "Invalid file path" });
      }

      // Verify files actually exist
      for (const fp of [safeTaskTracker, safeRoster, safeManager]) {
        try { await fs.access(fp); } catch {
          return res.status(400).json({ message: `File not found: ${path.basename(fp)}` });
        }
      }

      const args = [
        "-m", "billing_bridge.cli",
        "audit",
        "--task-tracker", safeTaskTracker,
        "--roster", safeRoster,
        "--manager", safeManager,
        "--month", month || "Mar 26",
        "--out", outDir,
        "--alias-map", aliasPath,
        "--outward-map", outwardPath,
        "--site-map", sitePath,
      ];

      const pythonBin = process.env.BILLING_BRIDGE_PYTHON || "python";
      const child = spawn(pythonBin, args, {
        cwd: path.join(bridgeRoot, "src"),
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

      const exitCode = await new Promise<number>((resolve) => {
        child.on("close", (code) => resolve(code ?? 1));
      });

      if (exitCode !== 0) {
        return res.status(500).json({
          message: "Billing bridge failed",
          exitCode,
          stderr: stderr.slice(0, 2000),
          stdout: stdout.slice(0, 2000),
        });
      }

      // Read output files and return as JSON
      const outputFiles: Record<string, string> = {};
      try {
        const files = await fs.readdir(outDir);
        for (const f of files) {
          if (f.endsWith(".csv") || f.endsWith(".xlsx")) {
            outputFiles[f] = path.join(outDir, f);
          }
        }
      } catch {
        // outDir may not exist if bridge wrote elsewhere
      }

      res.json({
        message: "Billing bridge completed successfully",
        exitCode: 0,
        outputDir: outDir,
        outputFiles,
        stdout: stdout.slice(0, 5000),
      });
    } catch (error) {
      if (error instanceof Error) return res.status(500).json({ message: error.message });
      res.status(500).json({ message: "Failed to run billing bridge" });
    }
  });

  // Status / health check for billing bridge availability
  app.get("/api/billing-bridge/status", requireAuth, async (_req, res) => {
    try {
      const path = await import("path");
      const fs = await import("fs/promises");
      const bridgeRoot = path.resolve(__dirname, "../tools/billing_bridge");

      const checks = {
        configExists: false,
        cliExists: false,
        pythonAvailable: false,
      };

      try { await fs.access(path.join(bridgeRoot, "config")); checks.configExists = true; } catch {}
      try { await fs.access(path.join(bridgeRoot, "src/billing_bridge/cli.py")); checks.cliExists = true; } catch {}

      const { execSync } = await import("child_process");
      const pythonBin = process.env.BILLING_BRIDGE_PYTHON || "python";
      try {
        execSync(`${pythonBin} --version`, { timeout: 5000 });
        checks.pythonAvailable = true;
      } catch {}

      res.json({
        available: checks.configExists && checks.cliExists && checks.pythonAvailable,
        ...checks,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check billing bridge status" });
    }
  });

  // ── Billing Bridge: In-app reconciliation preview ─────────────────────────
  // Accepts uploaded workbooks, runs TS extractors + reconciliation,
  // and returns full exception + contribution data as JSON.

  const bridgeUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  app.post(
    "/api/billing-bridge/reconcile",
    requireAuth,
    bridgeUpload.fields([
      { name: "taskTracker", maxCount: 1 },
      { name: "roster", maxCount: 1 },
      { name: "manager", maxCount: 1 },
    ]),
    async (req, res) => {
      let tmpDir: string | null = null;
      let ttPath: string | null = null;
      let rbPath: string | null = null;
      let mwPath: string | null = null;
      try {
        const fs = await import("fs");
        const path = await import("path");
        const os = await import("os");

        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        if (!files?.taskTracker?.[0] || !files?.roster?.[0]) {
          return res.status(400).json({ message: "taskTracker and roster files are required" });
        }

        // Write buffers to temp files so xlsx can read them
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "billing-bridge-"));
        ttPath = path.join(tmpDir, "task_tracker.xlsx");
        rbPath = path.join(tmpDir, "roster.xlsx");
        mwPath = files.manager?.[0] ? path.join(tmpDir, "manager.xlsx") : null;

        fs.writeFileSync(ttPath, files.taskTracker[0].buffer);
        fs.writeFileSync(rbPath, files.roster[0].buffer);
        if (mwPath && files.manager?.[0]) {
          fs.writeFileSync(mwPath, files.manager[0].buffer);
        }

        const { extractTaskTracker } = await import("./services/corporate-extractors/task-tracker-extractor");
        const { extractRosterBilling } = await import("./services/corporate-extractors/roster-billing-extractor");
        const { extractManagerWorkbook } = await import("./services/corporate-extractors/manager-workbook-extractor");
        const { reconcile } = await import("./services/corporate-extractors/reconcile");
        const { buildContributions } = await import("./services/corporate-extractors/contributions-engine");
        const { normalizeTeamsSnapshot } = await import("./services/corporate-extractors/teams-snapshot");
        const { buildSuggestedFill, suggestedFillToCsv } = await import("./services/corporate-extractors/suggested-fill");

        const tt = extractTaskTracker(ttPath);
        const rb = extractRosterBilling(rbPath);
        const mw = mwPath ? extractManagerWorkbook(mwPath) : null;

        // Optional Teams deployment-chat snapshot (posted as a multipart text
        // field with a JSON body produced by the browser sweep).
        let teamsNormalized: Awaited<ReturnType<typeof normalizeTeamsSnapshot>> | null = null;
        const rawTeamsField = (req.body?.teamsSnapshot ?? "") as unknown;
        if (typeof rawTeamsField === "string" && rawTeamsField.trim().length > 0) {
          try {
            const parsed = JSON.parse(rawTeamsField);
            teamsNormalized = normalizeTeamsSnapshot(parsed);
          } catch {
            // Silently ignore malformed snapshot — we still return base
            // reconciliation rather than hard-fail the whole upload.
            teamsNormalized = null;
          }
        }
        const strictTeams = (req.body?.strictTeamsPresence === "true"
          || req.body?.strictTeamsPresence === true);

        const reconResult = reconcile({
          task_evidence_daily: tt.task_evidence_daily,
          task_evidence_event: tt.task_evidence_event,
          attendance: rb.attendance,
          billing_detail_existing: rb.billing_detail_existing,
          teams_presence: teamsNormalized?.rows,
          strict_teams_presence: strictTeams,
        });

        const contribs = buildContributions({
          task_evidence_daily: tt.task_evidence_daily,
          task_evidence_event: tt.task_evidence_event,
          billing_detail_existing: rb.billing_detail_existing,
          manager_existing_rows: [
            ...rb.manager_internal_existing,
            ...(mw?.manager_existing_rows ?? []),
          ],
        });

        const suggestedFillRows = buildSuggestedFill({
          exceptions: reconResult.exceptions,
          task_catalog: tt.task_catalog,
          teams_presence: teamsNormalized?.rows,
        });

        res.json({
          reconciliation: reconResult,
          contributions: {
            field_insights: contribs.field_insights,
            experience_ledger: contribs.experience_ledger,
            assignment_evidence: contribs.assignment_evidence,
          },
          people: rb.people,
          attendance_count: rb.attendance.length,
          suggested_fill: {
            rows: suggestedFillRows,
            csv: suggestedFillToCsv(suggestedFillRows),
          },
          teams: teamsNormalized ? {
            row_count: teamsNormalized.rows.length,
            unmapped_display_names: teamsNormalized.unmapped_display_names,
            skipped_count: teamsNormalized.skipped.length,
            generated_at: teamsNormalized.generated_at ?? null,
            topic_pattern: teamsNormalized.topic_pattern ?? null,
            tool_version: teamsNormalized.tool_version ?? null,
            strict: strictTeams,
          } : null,
          ingest_errors: [
            ...tt.errors.map(e => ({ ...e, workbook: "task_tracker" })),
            ...rb.errors.map(e => ({ ...e, workbook: "roster" })),
            ...(mw?.errors ?? []).map(e => ({ ...e, workbook: "manager" })),
          ],
        });
      } catch (error) {
        if (error instanceof Error) return res.status(500).json({ message: error.message });
        res.status(500).json({ message: "Failed to run reconciliation" });
      } finally {
        // Always clean up temp files — guard each removal to avoid masking original errors
        try {
          const fs = await import("fs");
          for (const fp of [ttPath, rbPath, mwPath]) {
            if (fp && fs.existsSync(fp)) {
              try { fs.unlinkSync(fp); } catch {}
            }
          }
          if (tmpDir && fs.existsSync(tmpDir)) {
            try { fs.rmdirSync(tmpDir); } catch {}
          }
        } catch {}
      }
    },
  );

  app.post(
    "/api/billing-bridge/hours-report",
    requireAuth,
    bridgeUpload.fields([
      { name: "taskTracker", maxCount: 1 },
      { name: "roster", maxCount: 1 },
      { name: "manager", maxCount: 1 },
    ]),
    async (req, res) => {
      let tmpDir: string | null = null;
      let ttPath: string | null = null;
      let rbPath: string | null = null;
      let mwPath: string | null = null;
      try {
        const fs = await import("fs");
        const path = await import("path");
        const os = await import("os");

        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        if (!files?.taskTracker?.[0] || !files?.roster?.[0]) {
          return res.status(400).json({ message: "taskTracker and roster files are required" });
        }

        const technicianQuery = String(req.body?.technicianQuery ?? "").trim();
        const projectFilter = String(req.body?.projectFilter ?? "").trim();
        if (!technicianQuery && !projectFilter) {
          return res.status(400).json({
            message: "technicianQuery and/or projectFilter is required",
          });
        }

        const {
          validateHoursReportParams,
          buildTechnicianHoursReport,
          resolveTechnicianName,
          personMatchesProjectFilter,
        } = await import("./services/corporate-extractors/technician-hours-report");
        const { buildTechnicianHoursXlsxBuffer } = await import(
          "./services/corporate-extractors/technician-hours-xlsx"
        );

        const trimBodyOpt = (raw: unknown) =>
          raw == null ? undefined : String(raw).trim();

        const v = validateHoursReportParams({
          month: trimBodyOpt(req.body?.month),
          focusStart: trimBodyOpt(req.body?.focusStart),
          focusEnd: trimBodyOpt(req.body?.focusEnd),
        });
        if (!v.ok) {
          return res.status(400).json({ message: v.message });
        }

        const monthStr = trimBodyOpt(req.body?.month) ?? "";
        const focusStartStr = trimBodyOpt(req.body?.focusStart) ?? "";
        const focusEndStr = trimBodyOpt(req.body?.focusEnd) ?? "";

        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "billing-bridge-hours-"));
        ttPath = path.join(tmpDir, "task_tracker.xlsx");
        rbPath = path.join(tmpDir, "roster.xlsx");
        mwPath = files.manager?.[0] ? path.join(tmpDir, "manager.xlsx") : null;

        fs.writeFileSync(ttPath, files.taskTracker[0].buffer);
        fs.writeFileSync(rbPath, files.roster[0].buffer);
        if (mwPath && files.manager?.[0]) {
          fs.writeFileSync(mwPath, files.manager[0].buffer);
        }

        const { extractRosterBilling } = await import("./services/corporate-extractors/roster-billing-extractor");
        const { extractManagerWorkbook } = await import("./services/corporate-extractors/manager-workbook-extractor");

        const rb = extractRosterBilling(rbPath);
        const mw = mwPath ? extractManagerWorkbook(mwPath) : null;

        if (technicianQuery) {
          const resolved = resolveTechnicianName(technicianQuery, rb.people);
          if (!resolved) {
            const projMatches = projectFilter
              ? rb.people.filter((p) => personMatchesProjectFilter(p, projectFilter))
              : [];
            if (projMatches.length !== 1) {
              return res.status(400).json({
                message: `No roster match for technician: ${technicianQuery}`,
              });
            }
          }
        }

        const report = buildTechnicianHoursReport({
          attendance: rb.attendance,
          billing_detail_existing: rb.billing_detail_existing,
          manager_existing_rows: [
            ...rb.manager_internal_existing,
            ...(mw?.manager_existing_rows ?? []),
          ],
          people: rb.people,
          technicianQuery,
          projectFilter,
          month: monthStr,
          focusStart: focusStartStr,
          focusEnd: focusEndStr,
          fileNames: {
            taskTracker: files.taskTracker[0].originalname,
            roster: files.roster[0].originalname,
            manager: files.manager?.[0]?.originalname,
          },
        });

        const buffer = buildTechnicianHoursXlsxBuffer(report, {
          taskTracker: files.taskTracker[0].originalname,
          roster: files.roster[0].originalname,
          manager: files.manager?.[0]?.originalname,
        });

        const slugBase =
          report.meta.resolvedTechnician ||
          (projectFilter ? `project-${projectFilter}` : "hours");
        const safe = slugBase.replace(/[^\w.\- ()]+/g, "_").slice(0, 72);
        const monthPart = monthStr.replace(/\s/g, "");
        const filename = `technician-hours-${safe}-${monthPart}.xlsx`;

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(buffer);
      } catch (error) {
        if (error instanceof Error) return res.status(500).json({ message: error.message });
        res.status(500).json({ message: "Failed to build hours report" });
      } finally {
        try {
          const fs = await import("fs");
          for (const fp of [ttPath, rbPath, mwPath]) {
            if (fp && fs.existsSync(fp)) {
              try { fs.unlinkSync(fp); } catch {}
            }
          }
          if (tmpDir && fs.existsSync(tmpDir)) {
            try { fs.rmdirSync(tmpDir); } catch {}
          }
        } catch {}
      }
    },
  );

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

  // ─── User Self-Service Export & Import (GDPR) routes are handled above with step-up auth.

  // ─── Collaboration routes ──────────────────────────────────────────────────

  const invitePreviewSchema = z.object({
    handle: z.string().min(1).max(64),
  });

  app.post("/api/invites/preview", requireAuth, async (req, res) => {
    try {
      const parsed = invitePreviewSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: "Handle is required" });
      const preview = await getInvitePreviewByPublicHandle(parsed.data.handle);
      if (!preview) return res.json({ found: false });
      return res.json({ found: true, preview: toPublicInviteUserPreview(preview) });
    } catch (error) {
      return res.status(500).json({ message: "Failed to preview handle" });
    }
  });

  app.get("/api/invites/handle-suggestions", requireAuth, async (req, res) => {
    try {
      const raw = String(req.query.query ?? "").trim();
      const normalized = raw.toLowerCase().replace(/^@+/, "");
      if (normalized.length < 2) {
        return res.json({ suggestions: [] });
      }
      const rows = await searchPublicInvitePreviewsByPrefix(normalized, 5);
      return res.json({ suggestions: rows.map((row) => toPublicInviteUserPreview(row)) });
    } catch (error) {
      return res.status(500).json({ message: "Failed to load handle suggestions" });
    }
  });

  app.get("/api/invites/recent-collaborators", requireAuth, async (req, res) => {
    try {
      const rows = await getRecentInviteCollaboratorPreviews(req.user!.id, 8);
      return res.json({ recent: rows.map((row) => toPublicInviteUserPreview(row)) });
    } catch (error) {
      return res.status(500).json({ message: "Failed to load recent collaborators" });
    }
  });

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
      const { handle, role } = req.body;
      if (!handle) return res.status(400).json({ message: "Handle is required" });
      const validRoles = ["editor", "viewer"];
      if (role && !validRoles.includes(role)) return res.status(400).json({ message: "Invalid role" });
      const user = await getUserByPublicHandle(handle);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.id === req.user!.id) return res.status(400).json({ message: "Cannot add yourself" });
      const collab = await addCollaborator(req.params.id, user.id, role || "viewer", req.user!.id);
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

  // ════════════════════════════════════════════════════════════════════════
  // ARCHETYPE EMPATHY READ API (admin + scoped RAG token)
  // See docs/ARCHETYPE_EMPATHY_ANALYTICS.md for the privacy model.
  // ════════════════════════════════════════════════════════════════════════

  const ARCHETYPE_READ_HEADER = "x-axtask-archetype-token";
  function requireArchetypeRead(req: Request, res: Response, next: NextFunction) {
    // Admin sessions bypass the token requirement.
    if (req.isAuthenticated?.() && req.user?.role === "admin") return next();
    const expected = (process.env.ARCHETYPE_READ_TOKEN || "").trim();
    if (!expected) {
      return res.status(503).json({ message: "Archetype read disabled (no token configured)" });
    }
    const provided = String(req.get(ARCHETYPE_READ_HEADER) || "").trim();
    if (!provided || provided !== expected) {
      return res.status(401).json({ message: "Archetype read token required" });
    }
    next();
  }

  const ARCHETYPE_K_ANON_THRESHOLD = 5;
  const ARCHETYPE_MAX_WINDOW_DAYS = 180;

  function parseIsoDay(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const m = raw.trim().match(/^\d{4}-\d{2}-\d{2}$/);
    return m ? m[0] : null;
  }

  function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  app.get("/api/archetypes/empathy", requireArchetypeRead, async (req, res) => {
    try {
      const to = parseIsoDay(req.query.to) || new Date().toISOString().slice(0, 10);
      const from = parseIsoDay(req.query.from)
        || new Date(Date.parse(`${to}T00:00:00.000Z`) - 29 * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
      const start = Date.parse(`${from}T00:00:00.000Z`);
      const end = Date.parse(`${to}T00:00:00.000Z`);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return res.status(400).json({ message: "Invalid from/to range" });
      }
      const spanDays = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
      if (spanDays > ARCHETYPE_MAX_WINDOW_DAYS) {
        return res.status(400).json({ message: `Window exceeds ${ARCHETYPE_MAX_WINDOW_DAYS} days` });
      }

      const rows = await db
        .select({
          archetypeKey: archetypeRollupDaily.archetypeKey,
          bucketDate: archetypeRollupDaily.bucketDate,
          empathyScore: archetypeRollupDaily.empathyScore,
          samples: archetypeRollupDaily.samples,
        })
        .from(archetypeRollupDaily)
        .where(and(
          gte(archetypeRollupDaily.bucketDate, from),
          lte(archetypeRollupDaily.bucketDate, to),
        ))
        .orderBy(archetypeRollupDaily.archetypeKey, archetypeRollupDaily.bucketDate);

      const grouped = new Map<string, Array<{ date: string; empathyScore: number; samples: number }>>();
      for (const row of rows) {
        if (row.samples < ARCHETYPE_K_ANON_THRESHOLD) continue;
        const bucket = grouped.get(row.archetypeKey) ?? [];
        bucket.push({
          date: row.bucketDate,
          empathyScore: Number(row.empathyScore.toFixed(4)),
          samples: row.samples,
        });
        grouped.set(row.archetypeKey, bucket);
      }

      const series = Array.from(grouped.entries()).map(([archetypeKey, points]) => ({
        archetypeKey,
        series: points,
      }));

      res.json({ from, to, kAnonymityThreshold: ARCHETYPE_K_ANON_THRESHOLD, series });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to read archetype empathy" });
    }
  });

  app.get("/api/archetypes/markov", requireArchetypeRead, async (req, res) => {
    try {
      const windowRaw = String(req.query.window || "30d").trim();
      const windowMatch = windowRaw.match(/^(\d+)d$/);
      const windowDays = windowMatch
        ? clampInt(windowMatch[1], 1, ARCHETYPE_MAX_WINDOW_DAYS, 30)
        : 30;

      const today = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.parse(`${today}T00:00:00.000Z`) - (windowDays - 1) * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);

      const rows = await db
        .select({
          fromArchetype: archetypeMarkovDaily.fromArchetype,
          toArchetype: archetypeMarkovDaily.toArchetype,
          count: archetypeMarkovDaily.count,
        })
        .from(archetypeMarkovDaily)
        .where(and(
          gte(archetypeMarkovDaily.bucketDate, from),
          lte(archetypeMarkovDaily.bucketDate, today),
        ));

      const pairs = new Map<string, number>();
      const fromTotals = new Map<string, number>();
      for (const r of rows) {
        const key = `${r.fromArchetype}->${r.toArchetype}`;
        pairs.set(key, (pairs.get(key) ?? 0) + r.count);
        fromTotals.set(r.fromArchetype, (fromTotals.get(r.fromArchetype) ?? 0) + r.count);
      }

      const matrix: Array<{ from: string; to: string; probability: number; samples: number }> = [];
      for (const [key, count] of pairs.entries()) {
        const [fromKey, toKey] = key.split("->");
        const total = fromTotals.get(fromKey) ?? 0;
        if (total < ARCHETYPE_K_ANON_THRESHOLD) continue;
        matrix.push({
          from: fromKey,
          to: toKey,
          probability: Number((total > 0 ? count / total : 0).toFixed(4)),
          samples: count,
        });
      }

      res.json({
        window: `${windowDays}d`,
        from,
        to: today,
        kAnonymityThreshold: ARCHETYPE_K_ANON_THRESHOLD,
        transitions: matrix,
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to read archetype markov" });
    }
  });

  attachShoppingListRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
