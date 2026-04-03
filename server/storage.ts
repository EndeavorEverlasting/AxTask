import { tasks, users, passwordResetTokens, securityLogs, securityEvents, securityAlerts, wallets, coinTransactions, userBadges, rewardsCatalog, userRewards, offlineGenerators, offlineSkillNodes, userOfflineSkills, usageSnapshots, storagePolicies, attachmentAssets, taskImportFingerprints, invoices, invoiceEvents, mfaChallenges, idempotencyKeys, premiumSubscriptions, premiumSavedViews, premiumReviewWorkflows, premiumInsights, premiumEvents, userNotificationPreferences, userPushSubscriptions, type Task, type InsertTask, type UpdateTask, type User, type SafeUser, type SecurityLog, type SecurityEvent, type SecurityAlert, type Wallet, type CoinTransaction, type UserBadge, type RewardItem, type OfflineGenerator, type OfflineSkillNode, type UserOfflineSkill, type UsageSnapshot, type StoragePolicy, type AttachmentAsset, type Invoice, type InvoiceEvent, type PremiumSubscription, type PremiumSavedView, type PremiumReviewWorkflow, type PremiumInsight, type PremiumEvent, type UserNotificationPreference, type UserPushSubscription } from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike, or, asc, lt, count, avg, sql, desc, inArray } from "drizzle-orm";
import { randomUUID, randomBytes, createHash } from "crypto";
import bcrypt from "bcrypt";
import { buildSecurityEventHash } from "./security/event-hash";
import { parseFeedbackPayload, parseFeedbackReviewPayload } from "./services/feedback-inbox-parser";
import { getNotificationDispatchProfile, shouldDispatchByIntensity, type NotificationDispatchProfile } from "./services/notification-intensity";

// ─── User helpers ────────────────────────────────────────────────────────────

function toSafeUser(user: User): SafeUser {
  const { passwordHash, securityAnswerHash, failedLoginAttempts, lockedUntil, workosId, googleId, replitId, ...safe } = user;
  return safe;
}

export async function createUser(
  email: string,
  password: string,
  displayName?: string,
  role?: "admin" | "user"
): Promise<SafeUser> {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({
      id,
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      authProvider: "local",
      ...(role ? { role } : {}),
    })
    .returning();
  return toSafeUser(user);
}

/**
 * Find or create a user from an OAuth provider (WorkOS or Google).
 * If a user with the same email exists, link the provider ID and return them.
 * If not, create a new user with no password.
 */
export async function findOrCreateOAuthUser(opts: {
  email: string;
  displayName?: string;
  profileImageUrl?: string;
  provider: "workos" | "google" | "replit";
  providerId: string;
}): Promise<SafeUser> {
  const { email, displayName, profileImageUrl, provider, providerId } = opts;
  const normalizedEmail = email.toLowerCase();

  // Check if already linked by provider ID
  const providerCol =
    provider === "workos" ? users.workosId :
    provider === "replit" ? users.replitId :
    users.googleId;
  const [existingByProvider] = await db
    .select().from(users)
    .where(eq(providerCol, providerId));
  if (existingByProvider) {
    const updateData: Record<string, any> = {};
    if (displayName && displayName !== existingByProvider.displayName) updateData.displayName = displayName;
    if (profileImageUrl && profileImageUrl !== existingByProvider.profileImageUrl) updateData.profileImageUrl = profileImageUrl;
    if (Object.keys(updateData).length > 0) {
      await db.update(users).set(updateData).where(eq(users.id, existingByProvider.id));
      Object.assign(existingByProvider, updateData);
    }
    return toSafeUser(existingByProvider);
  }

  // Check if a user with this email already exists (link the provider)
  const existingByEmail = await getUserByEmail(normalizedEmail);
  if (existingByEmail) {
    const updateData: Record<string, any> = {};
    if (provider === "workos") updateData.workosId = providerId;
    else if (provider === "replit") updateData.replitId = providerId;
    else updateData.googleId = providerId;
    if (displayName && !existingByEmail.displayName) updateData.displayName = displayName;
    if (profileImageUrl && !existingByEmail.profileImageUrl) updateData.profileImageUrl = profileImageUrl;
    await db.update(users).set(updateData).where(eq(users.id, existingByEmail.id));
    return toSafeUser({ ...existingByEmail, ...updateData });
  }

  // Create new OAuth user (no password)
  const id = randomUUID();
  const providerIdMap: Record<string, string> = {};
  if (provider === "workos") providerIdMap.workosId = providerId;
  else if (provider === "replit") providerIdMap.replitId = providerId;
  else providerIdMap.googleId = providerId;
  const [user] = await db
    .insert(users)
    .values({
      id,
      email: normalizedEmail,
      passwordHash: null,
      displayName: displayName || normalizedEmail.split("@")[0],
      authProvider: provider,
      profileImageUrl: profileImageUrl || null,
      ...providerIdMap,
    })
    .returning();
  return toSafeUser(user);
}

/**
 * DEV ONLY — rotate a user's password. Exported only for seed-dev.ts.
 * Never call this from a route handler.
 */
export async function resetPasswordForDev(
  email: string,
  newPassword: string
): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash: hash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(users.email, email.toLowerCase()));
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  return user || undefined;
}

export async function getUserById(id: string): Promise<SafeUser | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ? toSafeUser(user) : undefined;
}

const DEFAULT_NOTIFICATION_INTENSITY = 50;

function clampNotificationIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeNotificationPreference(
  userId: string,
  row?: UserNotificationPreference,
): UserNotificationPreference {
  const now = new Date();
  return {
    userId,
    enabled: row?.enabled ?? false,
    intensity: clampNotificationIntensity(row?.intensity ?? DEFAULT_NOTIFICATION_INTENSITY),
    quietHoursStart: row?.quietHoursStart ?? null,
    quietHoursEnd: row?.quietHoursEnd ?? null,
    createdAt: row?.createdAt ?? now,
    updatedAt: row?.updatedAt ?? now,
  };
}

export async function getUserNotificationPreference(userId: string): Promise<UserNotificationPreference> {
  const [row] = await db
    .select()
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId));
  return normalizeNotificationPreference(userId, row);
}

export async function upsertUserNotificationPreference(input: {
  userId: string;
  enabled?: boolean;
  intensity?: number;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
}): Promise<UserNotificationPreference> {
  const existing = await getUserNotificationPreference(input.userId);
  const [updated] = await db
    .insert(userNotificationPreferences)
    .values({
      userId: input.userId,
      enabled: input.enabled ?? existing.enabled,
      intensity: clampNotificationIntensity(input.intensity ?? existing.intensity),
      quietHoursStart: input.quietHoursStart ?? existing.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd ?? existing.quietHoursEnd,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userNotificationPreferences.userId,
      set: {
        enabled: input.enabled ?? existing.enabled,
        intensity: clampNotificationIntensity(input.intensity ?? existing.intensity),
        quietHoursStart: input.quietHoursStart ?? existing.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd ?? existing.quietHoursEnd,
        updatedAt: new Date(),
      },
    })
    .returning();
  return normalizeNotificationPreference(input.userId, updated);
}

export async function listUserPushSubscriptions(userId: string): Promise<UserPushSubscription[]> {
  return db
    .select()
    .from(userPushSubscriptions)
    .where(eq(userPushSubscriptions.userId, userId))
    .orderBy(desc(userPushSubscriptions.updatedAt));
}

export async function upsertUserPushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime?: number | null;
  userAgent?: string;
}): Promise<UserPushSubscription> {
  const [updated] = await db
    .insert(userPushSubscriptions)
    .values({
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      expirationTime: input.expirationTime ?? null,
      userAgent: input.userAgent ?? null,
      updatedAt: new Date(),
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userPushSubscriptions.endpoint,
      set: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        expirationTime: input.expirationTime ?? null,
        userAgent: input.userAgent ?? null,
        updatedAt: new Date(),
        lastSeenAt: new Date(),
      },
    })
    .returning();
  return updated;
}

export async function deleteUserPushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const result = await db
    .delete(userPushSubscriptions)
    .where(and(
      eq(userPushSubscriptions.userId, userId),
      eq(userPushSubscriptions.endpoint, endpoint),
    ));
  return (result.rowCount || 0) > 0;
}

export type PushDispatchCandidate = {
  userId: string;
  subscription: UserPushSubscription;
  preference: UserNotificationPreference;
  dispatchProfile: NotificationDispatchProfile;
};

export async function listPushDispatchCandidates(limit = 200): Promise<PushDispatchCandidate[]> {
  const preferences = await db
    .select()
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.enabled, true))
    .limit(Math.max(limit, 1));
  if (preferences.length === 0) return [];

  const prefByUserId = new Map(preferences.map((pref) => [pref.userId, pref]));
  const userIds = preferences.map((pref) => pref.userId);
  const subscriptions = await db
    .select()
    .from(userPushSubscriptions)
    .where(inArray(userPushSubscriptions.userId, userIds))
    .orderBy(desc(userPushSubscriptions.updatedAt));

  const candidates: PushDispatchCandidate[] = [];
  for (const subscription of subscriptions) {
    const pref = prefByUserId.get(subscription.userId);
    if (!pref) continue;
    if (!shouldDispatchByIntensity({ intensity: pref.intensity, lastSentAt: subscription.lastSentAt })) continue;
    candidates.push({
      userId: subscription.userId,
      subscription,
      preference: pref,
      dispatchProfile: getNotificationDispatchProfile(pref.intensity),
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}

export async function markPushSubscriptionDispatched(endpoint: string): Promise<void> {
  await db
    .update(userPushSubscriptions)
    .set({
      lastSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(userPushSubscriptions.endpoint, endpoint));
}

export async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

// ─── Account lockout ────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function recordFailedLogin(email: string, ipAddress?: string): Promise<void> {
  const user = await getUserByEmail(email);
  if (!user) return;

  const attempts = (user.failedLoginAttempts ?? 0) + 1;
  const update: Record<string, unknown> = { failedLoginAttempts: attempts };

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    update.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    console.warn(`[SECURITY] Account locked: ${email} after ${attempts} failed attempts`);
    await logSecurityEvent("account_locked", user.id, undefined, ipAddress, `Account locked after ${attempts} failed attempts`);
  }

  await db
    .update(users)
    .set(update)
    .where(eq(users.email, email.toLowerCase()));
}

export async function resetFailedLogins(email: string): Promise<void> {
  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(users.email, email.toLowerCase()));
}

// ─── Security Question ──────────────────────────────────────────────────────

export async function setSecurityQuestion(
  userId: string,
  question: string,
  answer: string
): Promise<void> {
  const answerHash = await bcrypt.hash(answer.trim().toLowerCase(), 12);
  await db
    .update(users)
    .set({ securityQuestion: question, securityAnswerHash: answerHash })
    .where(eq(users.id, userId));
}

export async function getSecurityQuestion(email: string): Promise<string | null> {
  const user = await getUserByEmail(email);
  return user?.securityQuestion || null;
}

export async function verifySecurityAnswer(
  email: string,
  answer: string
): Promise<boolean> {
  const user = await getUserByEmail(email);
  if (!user?.securityAnswerHash) return false;
  return bcrypt.compare(answer.trim().toLowerCase(), user.securityAnswerHash);
}

// ─── Password Reset Tokens ──────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a password reset token. Returns the raw token (to send via email or return to client).
 * Only the SHA-256 hash is stored in the database.
 */
export async function createResetToken(
  email: string,
  method: "email" | "security_question" | "admin" = "email",
  expiresInMinutes = 30
): Promise<{ token: string; expiresAt: Date } | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash,
    method,
    expiresAt,
  });

  return { token: rawToken, expiresAt };
}

/**
 * Verify a reset token is valid (exists, not used, not expired).
 * Does NOT consume it — call consumeResetToken after password change.
 */
export async function verifyResetToken(
  token: string
): Promise<{ userId: string; method: string } | null> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash));

  if (!row) return null;
  if (row.usedAt) return null;
  if (new Date(row.expiresAt) < new Date()) return null;

  return { userId: row.userId, method: row.method };
}

/**
 * Consume a reset token (mark as used) and change the user's password.
 */
export async function consumeResetToken(
  token: string,
  newPassword: string
): Promise<boolean> {
  const valid = await verifyResetToken(token);
  if (!valid) return false;

  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Mark token as used
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.tokenHash, tokenHash));

  // Update password + reset lockout
  await db
    .update(users)
    .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(users.id, valid.userId));

  return true;
}

/**
 * Admin reset — directly set a user's password. Caller must verify admin role.
 */
export async function adminResetPassword(
  targetEmail: string,
  newPassword: string
): Promise<boolean> {
  const user = await getUserByEmail(targetEmail);
  if (!user) return false;

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(users.id, user.id));

  // Log for audit
  console.log(`[ADMIN] Password reset for ${targetEmail}`);
  return true;
}

/**
 * Clean up expired/used tokens older than 24 hours.
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, cutoff));
}

// ─── Ban / Unban ────────────────────────────────────────────────────────────

export async function banUser(
  targetUserId: string,
  bannedByUserId: string,
  reason: string,
  ipAddress?: string
): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!user) return false;
  if (user.role === "admin") return false;

  await db
    .update(users)
    .set({
      isBanned: true,
      banReason: reason,
      bannedAt: new Date(),
      bannedBy: bannedByUserId,
    })
    .where(eq(users.id, targetUserId));

  await logSecurityEvent("user_banned", bannedByUserId, targetUserId, ipAddress, reason);
  return true;
}

export async function unbanUser(
  targetUserId: string,
  unbannedByUserId: string,
  ipAddress?: string
): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!user) return false;

  await db
    .update(users)
    .set({
      isBanned: false,
      banReason: null,
      bannedAt: null,
      bannedBy: null,
    })
    .where(eq(users.id, targetUserId));

  await logSecurityEvent("user_unbanned", unbannedByUserId, targetUserId, ipAddress);
  return true;
}

export async function getAllUsers(): Promise<SafeUser[]> {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  return rows.map(toSafeUser);
}

export async function isUserBanned(email: string): Promise<{ banned: boolean; reason?: string }> {
  const user = await getUserByEmail(email);
  if (!user) return { banned: false };
  if (user.isBanned) return { banned: true, reason: user.banReason || undefined };
  return { banned: false };
}

// ─── Security Audit Logging ─────────────────────────────────────────────────

export async function logSecurityEvent(
  eventType: string,
  userId?: string,
  targetUserId?: string,
  ipAddress?: string,
  details?: string
): Promise<void> {
  await db.insert(securityLogs).values({
    id: randomUUID(),
    eventType,
    userId: userId || null,
    targetUserId: targetUserId || null,
    ipAddress: ipAddress || null,
    details: details || null,
  });
}

export async function getSecurityLogs(limit = 100): Promise<SecurityLog[]> {
  return db
    .select()
    .from(securityLogs)
    .orderBy(desc(securityLogs.createdAt))
    .limit(limit);
}

function hashUserAgent(userAgent?: string): string | null {
  if (!userAgent) return null;
  return createHash("sha256").update(userAgent).digest("hex");
}

export async function appendSecurityEvent(input: {
  eventType: string;
  actorUserId?: string;
  targetUserId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  ipAddress?: string;
  userAgent?: string;
  payload?: Record<string, unknown>;
}): Promise<SecurityEvent> {
  const [prev] = await db
    .select({ eventHash: securityEvents.eventHash })
    .from(securityEvents)
    .orderBy(desc(securityEvents.createdAt))
    .limit(1);

  const createdAt = new Date();
  const payloadJson = input.payload ? JSON.stringify(input.payload) : null;
  const userAgentHash = hashUserAgent(input.userAgent);
  const prevHash = prev?.eventHash || null;
  const eventHash = buildSecurityEventHash({
    eventType: input.eventType,
    actorUserId: input.actorUserId || null,
    targetUserId: input.targetUserId || null,
    route: input.route || null,
    method: input.method || null,
    statusCode: input.statusCode ?? null,
    ipAddress: input.ipAddress || null,
    userAgentHash,
    payloadJson,
    prevHash,
    createdAtIso: createdAt.toISOString(),
  });

  const [inserted] = await db.insert(securityEvents).values({
    id: randomUUID(),
    eventType: input.eventType,
    actorUserId: input.actorUserId || null,
    targetUserId: input.targetUserId || null,
    route: input.route || null,
    method: input.method || null,
    statusCode: input.statusCode ?? null,
    ipAddress: input.ipAddress || null,
    userAgentHash,
    payloadJson,
    prevHash,
    eventHash,
    createdAt,
  }).returning();
  return inserted;
}

export async function getSecurityEvents(limit = 200): Promise<SecurityEvent[]> {
  return db
    .select()
    .from(securityEvents)
    .orderBy(desc(securityEvents.createdAt))
    .limit(limit);
}

export type FeedbackInboxItem = {
  id: string;
  createdAt: Date | null;
  actorUserId: string | null;
  messageLength: number;
  attachments: number;
  classification: string;
  priority: string;
  sentiment: string;
  tags: string[];
  recommendedActions: string[];
  classifierSource: string;
  classifierFallbackLayer: number;
  classifierConfidence: number;
  reviewed: boolean;
  reviewedAt: Date | null;
  reviewedBy: string | null;
};

export async function listFeedbackInbox(limit = 100): Promise<FeedbackInboxItem[]> {
  const rows = await db
    .select()
    .from(securityEvents)
    .where(eq(securityEvents.eventType, "feedback_processed"))
    .orderBy(desc(securityEvents.createdAt))
    .limit(Math.min(limit, 500));

  const reviewRows = await db
    .select()
    .from(securityEvents)
    .where(eq(securityEvents.eventType, "feedback_review_state_changed"))
    .orderBy(desc(securityEvents.createdAt))
    .limit(2000);

  const reviewMap = new Map<string, { reviewed: boolean; reviewedAt: Date | null; reviewedBy: string | null }>();
  for (const row of reviewRows) {
    const parsed = parseFeedbackReviewPayload(row.payloadJson);
    if (!parsed) continue;
    if (!reviewMap.has(parsed.feedbackEventId)) {
      reviewMap.set(parsed.feedbackEventId, {
        reviewed: parsed.reviewed,
        reviewedAt: row.createdAt || null,
        reviewedBy: row.actorUserId || null,
      });
    }
  }

  return rows
    .map((row) => {
      const payload = parseFeedbackPayload(row.payloadJson);
      if (!payload) return null;
      const review = reviewMap.get(row.id);
      return {
        id: row.id,
        createdAt: row.createdAt || null,
        actorUserId: row.actorUserId || null,
        ...payload,
        reviewed: review?.reviewed || false,
        reviewedAt: review?.reviewedAt || null,
        reviewedBy: review?.reviewedBy || null,
      };
    })
    .filter((row): row is FeedbackInboxItem => Boolean(row));
}

export type FeedbackInsightsSummary = {
  total: number;
  byPriority: Record<string, number>;
  byClassification: Record<string, number>;
  bySentiment: Record<string, number>;
  urgentCount: number;
};

export async function getFeedbackInsightsForUser(
  userId: string,
  limit = 500,
): Promise<FeedbackInsightsSummary> {
  const rows = await db
    .select()
    .from(securityEvents)
    .where(and(
      eq(securityEvents.eventType, "feedback_processed"),
      eq(securityEvents.actorUserId, userId),
    ))
    .orderBy(desc(securityEvents.createdAt))
    .limit(Math.min(limit, 1000));

  const byPriority: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  const bySentiment: Record<string, number> = {};
  let urgentCount = 0;

  for (const row of rows) {
    const payload = parseFeedbackPayload(row.payloadJson);
    if (!payload) continue;

    byPriority[payload.priority] = (byPriority[payload.priority] || 0) + 1;
    byClassification[payload.classification] = (byClassification[payload.classification] || 0) + 1;
    bySentiment[payload.sentiment] = (bySentiment[payload.sentiment] || 0) + 1;

    if (payload.priority === "high" || payload.priority === "critical") {
      urgentCount += 1;
    }
  }

  return {
    total: rows.length,
    byPriority,
    byClassification,
    bySentiment,
    urgentCount,
  };
}

export async function getFeedbackInsightsGlobal(
  limit = 1000,
): Promise<FeedbackInsightsSummary> {
  const rows = await db
    .select()
    .from(securityEvents)
    .where(eq(securityEvents.eventType, "feedback_processed"))
    .orderBy(desc(securityEvents.createdAt))
    .limit(Math.min(limit, 5000));

  const byPriority: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  const bySentiment: Record<string, number> = {};
  let urgentCount = 0;

  for (const row of rows) {
    const payload = parseFeedbackPayload(row.payloadJson);
    if (!payload) continue;

    byPriority[payload.priority] = (byPriority[payload.priority] || 0) + 1;
    byClassification[payload.classification] = (byClassification[payload.classification] || 0) + 1;
    bySentiment[payload.sentiment] = (bySentiment[payload.sentiment] || 0) + 1;

    if (payload.priority === "high" || payload.priority === "critical") {
      urgentCount += 1;
    }
  }

  return {
    total: rows.length,
    byPriority,
    byClassification,
    bySentiment,
    urgentCount,
  };
}

export async function getSecurityAlerts(limit = 200): Promise<SecurityAlert[]> {
  return db
    .select()
    .from(securityAlerts)
    .orderBy(desc(securityAlerts.createdAt))
    .limit(limit);
}

async function createSecurityAlertIfMissing(ruleId: string, severity: "low" | "medium" | "high" | "critical", message: string, actorUserId?: string, details?: Record<string, unknown>) {
  const [existing] = await db
    .select()
    .from(securityAlerts)
    .where(and(
      eq(securityAlerts.ruleId, ruleId),
      eq(securityAlerts.status, "open"),
      actorUserId ? eq(securityAlerts.actorUserId, actorUserId) : sql`TRUE`,
    ))
    .orderBy(desc(securityAlerts.createdAt))
    .limit(1);

  if (existing) return;
  await db.insert(securityAlerts).values({
    id: randomUUID(),
    ruleId,
    severity,
    message,
    actorUserId: actorUserId || null,
    detailsJson: details ? JSON.stringify(details) : null,
    status: "open",
  });
}

export async function analyzeAndCreateSecurityAlerts(): Promise<{ created: number }> {
  let created = 0;
  const now = new Date();
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  const failedLoginsByIp = await db.execute(sql`
    SELECT ip_address, COUNT(*)::int AS attempts
    FROM security_logs
    WHERE event_type = 'login_failed' AND created_at >= ${tenMinutesAgo}
    GROUP BY ip_address
    HAVING COUNT(*) >= 6
  `);
  for (const row of failedLoginsByIp.rows as any[]) {
    await createSecurityAlertIfMissing(
      "login_failed_burst_ip",
      "high",
      `High failed-login volume from IP ${row.ip_address}`,
      undefined,
      { attempts: Number(row.attempts) || 0, ipAddress: row.ip_address },
    );
    created += 1;
  }

  const highFailureRoutes = await db.execute(sql`
    SELECT route, method, COUNT(*)::int AS failures
    FROM security_events
    WHERE created_at >= ${fifteenMinutesAgo} AND status_code >= 400
    GROUP BY route, method
    HAVING COUNT(*) >= 30
  `);
  for (const row of highFailureRoutes.rows as any[]) {
    await createSecurityAlertIfMissing(
      "route_failure_burst",
      "medium",
      `Route failure burst detected on ${row.method} ${row.route}`,
      undefined,
      { failures: Number(row.failures) || 0, route: row.route, method: row.method },
    );
    created += 1;
  }

  return { created };
}

// ─── Task storage ────────────────────────────────────────────────────────────

export interface IStorage {
  getTasks(userId: string): Promise<Task[]>;
  getTask(userId: string, id: string): Promise<Task | undefined>;
  createTask(userId: string, task: InsertTask): Promise<Task>;
  updateTask(userId: string, task: UpdateTask): Promise<Task | undefined>;
  deleteTask(userId: string, id: string): Promise<boolean>;
  getTasksByStatus(userId: string, status: string): Promise<Task[]>;
  getTasksByPriority(userId: string, priority: string): Promise<Task[]>;
  searchTasks(userId: string, query: string): Promise<Task[]>;
  createTasksBulk(userId: string, taskList: InsertTask[]): Promise<Task[]>;
  bulkUpdateTasks(userId: string, updates: UpdateTask[]): Promise<void>;
  reorderTasks(userId: string, taskIds: string[]): Promise<void>;
  getTaskStats(userId: string): Promise<{
    totalTasks: number;
    highPriorityTasks: number;
    completedToday: number;
    avgPriorityScore: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getTasks(userId: string): Promise<Task[]> {
    return await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(asc(tasks.sortOrder));
  }

  async getTask(userId: string, id: string): Promise<Task | undefined> {
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return task || undefined;
  }

  async createTask(userId: string, insertTask: InsertTask): Promise<Task> {
    const id = randomUUID();
    const now = new Date();

    const taskData = {
      ...insertTask,
      id,
      userId,
      priority: "Low",
      priorityScore: 0,
      classification: "General",
      isRepeated: false,
      createdAt: now,
      updatedAt: now,
    };

    const [task] = await db.insert(tasks).values(taskData).returning();
    return task;
  }

  async createTasksBulk(userId: string, taskList: InsertTask[]): Promise<Task[]> {
    if (taskList.length === 0) return [];
    const now = new Date();
    const BATCH_SIZE = 500;
    const allInserted: Task[] = [];

    for (let i = 0; i < taskList.length; i += BATCH_SIZE) {
      const batch = taskList.slice(i, i + BATCH_SIZE);
      const values = batch.map((t) => ({
        ...t,
        id: randomUUID(),
        userId,
        priority: "Low",
        priorityScore: 0,
        classification: "General",
        isRepeated: false,
        createdAt: now,
        updatedAt: now,
      }));
      const inserted = await db.insert(tasks).values(values).returning();
      allInserted.push(...inserted);
    }
    return allInserted;
  }

  async updateTask(userId: string, updateTask: UpdateTask): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ ...updateTask, updatedAt: new Date() })
      .where(and(eq(tasks.id, updateTask.id), eq(tasks.userId, userId)))
      .returning();
    return task || undefined;
  }

  async deleteTask(userId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async getTasksByStatus(userId: string, status: string): Promise<Task[]> {
    return await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, status)));
  }

  async getTasksByPriority(userId: string, priority: string): Promise<Task[]> {
    return await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.priority, priority)));
  }

  async searchTasks(userId: string, query: string): Promise<Task[]> {
    const lowercaseQuery = `%${query.toLowerCase()}%`;
    return await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          or(
            ilike(tasks.activity, lowercaseQuery),
            ilike(tasks.notes, lowercaseQuery),
            ilike(tasks.classification, lowercaseQuery)
          )
        )
      );
  }

  async bulkUpdateTasks(userId: string, updates: UpdateTask[]): Promise<void> {
    if (updates.length === 0) return;
    const now = new Date();
    const BATCH = 500;

    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);

      const buildCase = (column: string, getValue: (u: UpdateTask) => any | undefined) => {
        const parts = batch.map(u => {
          const val = getValue(u);
          if (val === undefined) return sql`WHEN id = ${u.id} THEN ${sql.raw(column)}`;
          return sql`WHEN id = ${u.id} THEN ${val}`;
        });
        return sql.join([sql`CASE`, ...parts, sql`ELSE ${sql.raw(column)} END`], sql` `);
      };

      const idParams = batch.map(u => sql`${u.id}`);

      await db.execute(sql`
        UPDATE tasks SET
          priority = ${buildCase('priority', u => u.priority)},
          priority_score = ${buildCase('priority_score', u => u.priorityScore)},
          classification = ${buildCase('classification', u => u.classification)},
          is_repeated = ${buildCase('is_repeated', u => u.isRepeated)},
          updated_at = ${now}
        WHERE user_id = ${userId} AND id IN (${sql.join(idParams, sql`, `)})
      `);
    }
  }

  async reorderTasks(userId: string, taskIds: string[]): Promise<void> {
    const now = new Date();
    const BATCH = 500;
    for (let i = 0; i < taskIds.length; i += BATCH) {
      const batch = taskIds.slice(i, i + BATCH);
      await Promise.all(
        batch.map((id, idx) =>
          db
            .update(tasks)
            .set({ sortOrder: i + idx, updatedAt: now })
            .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
        )
      );
    }
  }

  async getTaskStats(userId: string): Promise<{
    totalTasks: number;
    highPriorityTasks: number;
    completedToday: number;
    avgPriorityScore: number;
  }> {
    const today = new Date().toISOString().split("T")[0];

    const [[totalRow], [highPriorityRow], [completedTodayRow], [avgRow]] = await Promise.all([
      db.select({ value: count() }).from(tasks).where(eq(tasks.userId, userId)),
      db.select({ value: count() }).from(tasks).where(
        and(
          eq(tasks.userId, userId),
          or(eq(tasks.priority, "Highest"), eq(tasks.priority, "High"))
        )
      ),
      db.select({ value: count() }).from(tasks).where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "completed"),
          sql`${tasks.updatedAt}::date = ${today}::date`
        )
      ),
      db.select({ value: avg(tasks.priorityScore) }).from(tasks).where(eq(tasks.userId, userId)),
    ]);

    return {
      totalTasks: Number(totalRow?.value) || 0,
      highPriorityTasks: Number(highPriorityRow?.value) || 0,
      completedToday: Number(completedTodayRow?.value) || 0,
      avgPriorityScore: Number(avgRow?.value) || 0,
    };
  }
}

export const storage = new DatabaseStorage();

// ─── Gamification Storage ────────────────────────────────────────────────────

export async function getOrCreateWallet(userId: string): Promise<Wallet> {
  const [existing] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (existing) return existing;
  const [wallet] = await db.insert(wallets).values({ userId }).returning();
  return wallet;
}

export async function addCoins(
  userId: string,
  amount: number,
  reason: string,
  details?: string,
  taskId?: string
): Promise<{ wallet: Wallet; transaction: CoinTransaction }> {
  const wallet = await getOrCreateWallet(userId);
  const [updated] = await db
    .update(wallets)
    .set({
      balance: wallet.balance + amount,
      lifetimeEarned: wallet.lifetimeEarned + amount,
    })
    .where(eq(wallets.userId, userId))
    .returning();
  const [transaction] = await db
    .insert(coinTransactions)
    .values({ id: randomUUID(), userId, amount, reason, details, taskId })
    .returning();
  return { wallet: updated, transaction };
}

export async function hasTaskBeenAwarded(userId: string, taskId: string): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(and(
      eq(coinTransactions.userId, userId),
      eq(coinTransactions.taskId, taskId),
      eq(coinTransactions.reason, "task_completion")
    ));
  return (Number(row?.value) || 0) > 0;
}

export async function spendCoins(userId: string, amount: number, reason: string): Promise<Wallet | null> {
  const wallet = await getOrCreateWallet(userId);
  if (wallet.balance < amount) return null;
  const [updated] = await db
    .update(wallets)
    .set({ balance: wallet.balance - amount })
    .where(eq(wallets.userId, userId))
    .returning();
  await db.insert(coinTransactions).values({ id: randomUUID(), userId, amount: -amount, reason });
  return updated;
}

export async function getTransactions(userId: string, limit = 50): Promise<CoinTransaction[]> {
  return db
    .select()
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .orderBy(desc(coinTransactions.createdAt))
    .limit(limit);
}

export async function updateStreak(userId: string): Promise<Wallet> {
  const wallet = await getOrCreateWallet(userId);
  const today = new Date().toISOString().split("T")[0];

  if (wallet.lastCompletionDate === today) return wallet;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak = 1;
  if (wallet.lastCompletionDate === yesterdayStr) {
    newStreak = wallet.currentStreak + 1;
  }

  const longestStreak = Math.max(wallet.longestStreak, newStreak);

  const [updated] = await db
    .update(wallets)
    .set({ currentStreak: newStreak, longestStreak, lastCompletionDate: today })
    .where(eq(wallets.userId, userId))
    .returning();
  return updated;
}

export async function getUserBadges(userId: string): Promise<UserBadge[]> {
  return db.select().from(userBadges).where(eq(userBadges.userId, userId)).orderBy(desc(userBadges.earnedAt));
}

export async function awardBadge(userId: string, badgeId: string): Promise<UserBadge | null> {
  const existing = await db
    .select()
    .from(userBadges)
    .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)));
  if (existing.length > 0) return null;
  const [badge] = await db.insert(userBadges).values({ id: randomUUID(), userId, badgeId }).returning();
  return badge;
}

export async function getRewardsCatalog(): Promise<RewardItem[]> {
  return db.select().from(rewardsCatalog);
}

export async function getRewardById(id: string): Promise<RewardItem | undefined> {
  const [item] = await db.select().from(rewardsCatalog).where(eq(rewardsCatalog.id, id));
  return item;
}

export async function getUserRewards(userId: string): Promise<(typeof userRewards.$inferSelect)[]> {
  return db.select().from(userRewards).where(eq(userRewards.userId, userId)).orderBy(desc(userRewards.redeemedAt));
}

export async function redeemReward(userId: string, rewardId: string): Promise<boolean> {
  const reward = await getRewardById(rewardId);
  if (!reward) return false;
  const [existing] = await db
    .select({ value: count() })
    .from(userRewards)
    .where(and(eq(userRewards.userId, userId), eq(userRewards.rewardId, rewardId)));
  if ((Number(existing?.value) || 0) > 0) return false;
  const wallet = await spendCoins(userId, reward.cost, `Redeemed: ${reward.name}`);
  if (!wallet) return false;
  await db.insert(userRewards).values({ id: randomUUID(), userId, rewardId });
  return true;
}

export async function seedRewardsCatalog(): Promise<void> {
  const existing = await db.select().from(rewardsCatalog);
  if (existing.length > 0) return;
  await db.insert(rewardsCatalog).values([
    { id: randomUUID(), name: "Midnight Theme", description: "Unlock a deep dark theme with neon accents", cost: 100, type: "theme", icon: "🌙", data: "midnight" },
    { id: randomUUID(), name: "Sunset Theme", description: "Warm orange and pink gradient theme", cost: 100, type: "theme", icon: "🌅", data: "sunset" },
    { id: randomUUID(), name: "Ocean Theme", description: "Cool blue and teal oceanic theme", cost: 100, type: "theme", icon: "🌊", data: "ocean" },
    { id: randomUUID(), name: "Forest Theme", description: "Deep green nature-inspired theme", cost: 100, type: "theme", icon: "🌲", data: "forest" },
    { id: randomUUID(), name: "Gold Star Badge", description: "A shiny gold star displayed on your profile", cost: 50, type: "badge", icon: "⭐", data: "gold-star" },
    { id: randomUUID(), name: "Diamond Badge", description: "The prestigious diamond badge", cost: 200, type: "badge", icon: "💎", data: "diamond" },
    { id: randomUUID(), name: "Crown Badge", description: "A royal crown for task royalty", cost: 300, type: "badge", icon: "👑", data: "crown" },
    { id: randomUUID(), name: "Task Master Title", description: "Display 'Task Master' on your profile", cost: 150, type: "title", icon: "🏅", data: "Task Master" },
    { id: randomUUID(), name: "Productivity Guru Title", description: "Display 'Productivity Guru' on your profile", cost: 250, type: "title", icon: "🧠", data: "Productivity Guru" },
    { id: randomUUID(), name: "Legend Title", description: "Display 'Legend' on your profile", cost: 500, type: "title", icon: "🏆", data: "Legend" },
  ]);
}

const OFFLINE_GENERATOR_BASE_COST = 500;
const OFFLINE_GENERATOR_UPGRADE_BASE_COST = 250;
const OFFLINE_GENERATOR_BASE_RATE_PER_HOUR = 6;
const OFFLINE_GENERATOR_BASE_CAPACITY_HOURS = 12;
const OFFLINE_GENERATOR_MAX_LEVEL = 25;

type OfflineSkillEffects = {
  rateBonusPct: number;
  capacityBonusHours: number;
};

function computeSkillUpgradeCost(baseCost: number, currentLevel: number): number {
  // Linear growth is easy to reason about for players and balancing.
  return baseCost * (currentLevel + 1);
}

async function getOrCreateOfflineGenerator(userId: string): Promise<OfflineGenerator> {
  const [existing] = await db.select().from(offlineGenerators).where(eq(offlineGenerators.userId, userId));
  if (existing) return existing;
  const [created] = await db.insert(offlineGenerators).values({
    userId,
    isOwned: false,
    level: 0,
    baseRatePerHour: 0,
    baseCapacityHours: OFFLINE_GENERATOR_BASE_CAPACITY_HOURS,
    totalGenerated: 0,
  }).returning();
  return created;
}

async function getUserSkillLevels(userId: string): Promise<Array<UserOfflineSkill & { skillNode: OfflineSkillNode }>> {
  const rows = await db.select().from(userOfflineSkills).where(eq(userOfflineSkills.userId, userId));
  if (rows.length === 0) return [];
  const nodeIds = rows.map((row) => row.skillNodeId);
  const nodes = await db.select().from(offlineSkillNodes).where(inArray(offlineSkillNodes.id, nodeIds));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return rows
    .map((row) => {
      const skillNode = nodeById.get(row.skillNodeId);
      if (!skillNode) return null;
      return { ...row, skillNode };
    })
    .filter((row): row is UserOfflineSkill & { skillNode: OfflineSkillNode } => Boolean(row));
}

async function computeOfflineSkillEffects(userId: string): Promise<OfflineSkillEffects> {
  const skillLevels = await getUserSkillLevels(userId);
  return skillLevels.reduce<OfflineSkillEffects>((acc, row) => {
    const delta = row.level * row.skillNode.effectPerLevel;
    if (row.skillNode.effectType === "rate_pct") {
      acc.rateBonusPct += delta;
    } else if (row.skillNode.effectType === "capacity_hours") {
      acc.capacityBonusHours += delta;
    }
    return acc;
  }, { rateBonusPct: 0, capacityBonusHours: 0 });
}

export async function seedOfflineSkillTree(): Promise<void> {
  const existing = await db.select().from(offlineSkillNodes);
  if (existing.length > 0) return;
  await db.insert(offlineSkillNodes).values([
    {
      id: randomUUID(),
      skillKey: "dynamos",
      name: "Dynamos",
      description: "Increase generator coin output by 10% per level.",
      branch: "output",
      maxLevel: 5,
      baseCost: 120,
      effectType: "rate_pct",
      effectPerLevel: 10,
      prerequisiteSkillKey: null,
      sortOrder: 1,
    },
    {
      id: randomUUID(),
      skillKey: "stabilized-coils",
      name: "Stabilized Coils",
      description: "Further increase output by 12% per level.",
      branch: "output",
      maxLevel: 4,
      baseCost: 220,
      effectType: "rate_pct",
      effectPerLevel: 12,
      prerequisiteSkillKey: "dynamos",
      sortOrder: 2,
    },
    {
      id: randomUUID(),
      skillKey: "battery-bank",
      name: "Battery Bank",
      description: "Increase offline capacity by 4 hours per level.",
      branch: "capacity",
      maxLevel: 4,
      baseCost: 160,
      effectType: "capacity_hours",
      effectPerLevel: 4,
      prerequisiteSkillKey: null,
      sortOrder: 3,
    },
    {
      id: randomUUID(),
      skillKey: "deep-storage",
      name: "Deep Storage",
      description: "Increase offline capacity by 6 hours per level.",
      branch: "capacity",
      maxLevel: 3,
      baseCost: 260,
      effectType: "capacity_hours",
      effectPerLevel: 6,
      prerequisiteSkillKey: "battery-bank",
      sortOrder: 4,
    },
  ]);
}

export async function getOfflineGeneratorStatus(userId: string): Promise<{
  generator: OfflineGenerator;
  effectiveRatePerHour: number;
  effectiveCapacityHours: number;
  pendingCoins: number;
  skillEffects: OfflineSkillEffects;
}> {
  const generator = await getOrCreateOfflineGenerator(userId);
  const skillEffects = await computeOfflineSkillEffects(userId);
  const effectiveRatePerHour = Math.max(
    0,
    Math.floor(generator.baseRatePerHour * (1 + (skillEffects.rateBonusPct / 100))),
  );
  const effectiveCapacityHours = Math.max(1, generator.baseCapacityHours + skillEffects.capacityBonusHours);

  if (!generator.isOwned || !generator.lastClaimAt) {
    return { generator, effectiveRatePerHour, effectiveCapacityHours, pendingCoins: 0, skillEffects };
  }

  const elapsedHoursRaw = (Date.now() - new Date(generator.lastClaimAt).getTime()) / (1000 * 60 * 60);
  const elapsedHours = Math.max(0, Math.min(effectiveCapacityHours, elapsedHoursRaw));
  const pendingCoins = Math.floor(elapsedHours * effectiveRatePerHour);

  return { generator, effectiveRatePerHour, effectiveCapacityHours, pendingCoins, skillEffects };
}

export async function buyOfflineGenerator(userId: string): Promise<{ ok: boolean; message: string }> {
  const generator = await getOrCreateOfflineGenerator(userId);
  if (generator.isOwned) {
    return { ok: false, message: "Offline generator already owned." };
  }
  const wallet = await spendCoins(userId, OFFLINE_GENERATOR_BASE_COST, "offline_generator_purchase");
  if (!wallet) {
    return { ok: false, message: `Need ${OFFLINE_GENERATOR_BASE_COST} coins to buy the offline generator.` };
  }
  await db.update(offlineGenerators).set({
    isOwned: true,
    level: 1,
    baseRatePerHour: OFFLINE_GENERATOR_BASE_RATE_PER_HOUR,
    baseCapacityHours: OFFLINE_GENERATOR_BASE_CAPACITY_HOURS,
    lastClaimAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(offlineGenerators.userId, userId));
  return { ok: true, message: "Offline generator purchased." };
}

export async function upgradeOfflineGenerator(userId: string): Promise<{ ok: boolean; message: string }> {
  const generator = await getOrCreateOfflineGenerator(userId);
  if (!generator.isOwned) {
    return { ok: false, message: "Buy the offline generator first." };
  }
  if (generator.level >= OFFLINE_GENERATOR_MAX_LEVEL) {
    return { ok: false, message: "Offline generator is at max level." };
  }
  const upgradeCost = computeSkillUpgradeCost(OFFLINE_GENERATOR_UPGRADE_BASE_COST, generator.level - 1);
  const wallet = await spendCoins(userId, upgradeCost, "offline_generator_upgrade");
  if (!wallet) {
    return { ok: false, message: `Need ${upgradeCost} coins to upgrade.` };
  }
  await db.update(offlineGenerators).set({
    level: generator.level + 1,
    baseRatePerHour: generator.baseRatePerHour + 3,
    baseCapacityHours: generator.baseCapacityHours + ((generator.level + 1) % 3 === 0 ? 2 : 1),
    updatedAt: new Date(),
  }).where(eq(offlineGenerators.userId, userId));
  return { ok: true, message: "Offline generator upgraded." };
}

export async function getOfflineSkillTree(userId: string): Promise<Array<{
  id: string;
  skillKey: string;
  name: string;
  description: string;
  branch: string;
  maxLevel: number;
  currentLevel: number;
  nextCost: number | null;
  prerequisiteSkillKey: string | null;
  isUnlocked: boolean;
  isAvailable: boolean;
}>> {
  const [nodes, userSkills] = await Promise.all([
    db.select().from(offlineSkillNodes).orderBy(asc(offlineSkillNodes.sortOrder), asc(offlineSkillNodes.name)),
    getUserSkillLevels(userId),
  ]);

  const byNodeId = new Map(userSkills.map((row) => [row.skillNode.id, row]));
  const bySkillKey = new Map(userSkills.map((row) => [row.skillNode.skillKey, row]));

  return nodes.map((node) => {
    const unlocked = byNodeId.get(node.id);
    const currentLevel = unlocked?.level ?? 0;
    const hasPrereq = !node.prerequisiteSkillKey || (bySkillKey.get(node.prerequisiteSkillKey)?.level ?? 0) > 0;
    const atMax = currentLevel >= node.maxLevel;
    return {
      id: node.id,
      skillKey: node.skillKey,
      name: node.name,
      description: node.description,
      branch: node.branch,
      maxLevel: node.maxLevel,
      currentLevel,
      nextCost: atMax ? null : computeSkillUpgradeCost(node.baseCost, currentLevel),
      prerequisiteSkillKey: node.prerequisiteSkillKey,
      isUnlocked: currentLevel > 0,
      isAvailable: hasPrereq && !atMax,
    };
  });
}

export async function unlockOfflineSkill(userId: string, skillKey: string): Promise<{ ok: boolean; message: string }> {
  const [node] = await db.select().from(offlineSkillNodes).where(eq(offlineSkillNodes.skillKey, skillKey));
  if (!node) {
    return { ok: false, message: "Skill not found." };
  }

  const generator = await getOrCreateOfflineGenerator(userId);
  if (!generator.isOwned) {
    return { ok: false, message: "Buy the offline generator before unlocking skills." };
  }

  const unlockedSkills = await getUserSkillLevels(userId);
  const existing = unlockedSkills.find((row) => row.skillNode.id === node.id);
  const currentLevel = existing?.level ?? 0;
  if (currentLevel >= node.maxLevel) {
    return { ok: false, message: "Skill is already maxed." };
  }
  if (node.prerequisiteSkillKey) {
    const prereqLevel = unlockedSkills.find((row) => row.skillNode.skillKey === node.prerequisiteSkillKey)?.level ?? 0;
    if (prereqLevel <= 0) {
      return { ok: false, message: `Unlock prerequisite skill '${node.prerequisiteSkillKey}' first.` };
    }
  }

  const cost = computeSkillUpgradeCost(node.baseCost, currentLevel);
  const wallet = await spendCoins(userId, cost, `offline_skill_upgrade:${skillKey}`);
  if (!wallet) {
    return { ok: false, message: `Need ${cost} coins to unlock or upgrade this skill.` };
  }

  if (existing) {
    await db.update(userOfflineSkills).set({
      level: existing.level + 1,
      updatedAt: new Date(),
    }).where(eq(userOfflineSkills.id, existing.id));
  } else {
    await db.insert(userOfflineSkills).values({
      id: randomUUID(),
      userId,
      skillNodeId: node.id,
      level: 1,
      updatedAt: new Date(),
    });
  }

  return { ok: true, message: "Skill upgraded successfully." };
}

export async function claimOfflineGeneratorCoins(userId: string): Promise<{ ok: boolean; message: string; claimedCoins: number }> {
  const status = await getOfflineGeneratorStatus(userId);
  if (!status.generator.isOwned) {
    return { ok: false, message: "Offline generator not owned.", claimedCoins: 0 };
  }
  if (status.pendingCoins <= 0) {
    await db.update(offlineGenerators).set({
      lastClaimAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(offlineGenerators.userId, userId));
    return { ok: true, message: "No offline coins to claim yet.", claimedCoins: 0 };
  }

  await addCoins(
    userId,
    status.pendingCoins,
    "offline_generator_claim",
    `Claimed from offline generator (lvl ${status.generator.level})`,
  );
  await db.update(offlineGenerators).set({
    lastClaimAt: new Date(),
    totalGenerated: status.generator.totalGenerated + status.pendingCoins,
    updatedAt: new Date(),
  }).where(eq(offlineGenerators.userId, userId));

  return { ok: true, message: "Offline coins claimed.", claimedCoins: status.pendingCoins };
}

export async function getCompletedTaskCount(userId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "completed")));
  return Number(row?.value) || 0;
}

// ─── Usage + Storage Controls ────────────────────────────────────────────────
const DEFAULT_STORAGE_POLICY = {
  maxTasks: Number(process.env.STORAGE_MAX_TASKS || 100000),
  maxAttachmentBytes: Number(process.env.STORAGE_MAX_ATTACHMENT_BYTES || 50 * 1024 * 1024),
  maxAttachmentCount: Number(process.env.STORAGE_MAX_ATTACHMENT_COUNT || 500),
  maxTaskRetentionDays: Number(process.env.STORAGE_MAX_TASK_RETENTION_DAYS || 3650),
  softWarningPercent: Number(process.env.STORAGE_SOFT_WARNING_PERCENT || 80),
};

export async function getStoragePolicy(userId: string): Promise<StoragePolicy | (typeof DEFAULT_STORAGE_POLICY & { id: string; userId: string | null })> {
  const [row] = await db.select().from(storagePolicies).where(eq(storagePolicies.userId, userId));
  if (row) return row;
  return {
    id: "default",
    userId: null,
    ...DEFAULT_STORAGE_POLICY,
  };
}

export async function getStorageUsage(userId: string): Promise<{
  taskCount: number;
  attachmentCount: number;
  attachmentBytes: number;
}> {
  const [[taskCountRow], [attachmentRows]] = await Promise.all([
    db.select({ value: count() }).from(tasks).where(eq(tasks.userId, userId)),
    db.select({
      value: count(),
      bytes: sql<number>`COALESCE(SUM(${attachmentAssets.byteSize}), 0)`,
    }).from(attachmentAssets).where(and(eq(attachmentAssets.userId, userId), sql`${attachmentAssets.deletedAt} IS NULL`)),
  ]);

  return {
    taskCount: Number(taskCountRow?.value) || 0,
    attachmentCount: Number(attachmentRows?.value) || 0,
    attachmentBytes: Number(attachmentRows?.bytes) || 0,
  };
}

export async function assertCanCreateTasks(userId: string, incomingTasks: number): Promise<{ ok: boolean; message?: string }> {
  const [policy, usage] = await Promise.all([getStoragePolicy(userId), getStorageUsage(userId)]);
  if (usage.taskCount + incomingTasks > policy.maxTasks) {
    return {
      ok: false,
      message: `Task limit reached (${policy.maxTasks}). Remove older tasks or request a higher limit.`,
    };
  }
  return { ok: true };
}

export async function assertCanStoreAttachment(userId: string, byteSize: number): Promise<{ ok: boolean; message?: string }> {
  const [policy, usage] = await Promise.all([getStoragePolicy(userId), getStorageUsage(userId)]);
  if (usage.attachmentCount + 1 > policy.maxAttachmentCount) {
    return {
      ok: false,
      message: `Attachment count limit reached (${policy.maxAttachmentCount}).`,
    };
  }
  if (usage.attachmentBytes + byteSize > policy.maxAttachmentBytes) {
    return {
      ok: false,
      message: `Attachment storage limit reached (${policy.maxAttachmentBytes} bytes).`,
    };
  }
  return { ok: true };
}

export async function createAttachmentAsset(input: {
  userId: string;
  kind?: string;
  fileName?: string;
  mimeType: string;
  byteSize: number;
  metadataJson?: string;
}): Promise<AttachmentAsset> {
  const [asset] = await db.insert(attachmentAssets).values({
    id: randomUUID(),
    userId: input.userId,
    kind: input.kind || "feedback",
    fileName: input.fileName || null,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    metadataJson: input.metadataJson || null,
  }).returning();
  return asset;
}

export async function getAttachmentAssets(userId: string, kind?: string): Promise<AttachmentAsset[]> {
  if (kind) {
    return db.select().from(attachmentAssets).where(and(
      eq(attachmentAssets.userId, userId),
      eq(attachmentAssets.kind, kind),
      sql`${attachmentAssets.deletedAt} IS NULL`,
    )).orderBy(desc(attachmentAssets.createdAt));
  }
  return db.select().from(attachmentAssets).where(and(
    eq(attachmentAssets.userId, userId),
    sql`${attachmentAssets.deletedAt} IS NULL`,
  )).orderBy(desc(attachmentAssets.createdAt));
}

export async function getAttachmentAssetById(userId: string, assetId: string): Promise<AttachmentAsset | undefined> {
  const [asset] = await db.select().from(attachmentAssets).where(and(
    eq(attachmentAssets.id, assetId),
    eq(attachmentAssets.userId, userId),
  ));
  return asset;
}

export async function markAttachmentAssetUploaded(userId: string, assetId: string, metadata?: Record<string, unknown>): Promise<AttachmentAsset | undefined> {
  const [asset] = await db
    .update(attachmentAssets)
    .set({
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    })
    .where(and(eq(attachmentAssets.id, assetId), eq(attachmentAssets.userId, userId)))
    .returning();
  return asset;
}

export async function softDeleteAttachmentAsset(userId: string, assetId: string): Promise<AttachmentAsset | undefined> {
  const [asset] = await db
    .update(attachmentAssets)
    .set({ deletedAt: new Date() })
    .where(and(eq(attachmentAssets.id, assetId), eq(attachmentAssets.userId, userId)))
    .returning();
  return asset;
}

export async function retentionSweepAttachments(userId: string, retentionDays: number, dryRun = true): Promise<{
  candidateCount: number;
  candidates: AttachmentAsset[];
}> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const candidates = await db.select().from(attachmentAssets).where(and(
    eq(attachmentAssets.userId, userId),
    sql`${attachmentAssets.deletedAt} IS NULL`,
    lt(attachmentAssets.createdAt, cutoff),
  ));
  if (!dryRun && candidates.length > 0) {
    const ids = candidates.map((a) => a.id);
    await db.update(attachmentAssets)
      .set({ deletedAt: new Date() })
      .where(inArray(attachmentAssets.id, ids));
  }
  return { candidateCount: candidates.length, candidates };
}

export async function saveUsageSnapshot(input: {
  snapshotDate: string;
  source?: string;
  requests: number;
  errors: number;
  p95Ms: number;
  dbStorageMb: number;
  taskCount: number;
  attachmentBytes: number;
  spendMtdCents: number;
}): Promise<UsageSnapshot> {
  const [existing] = await db.select().from(usageSnapshots).where(eq(usageSnapshots.snapshotDate, input.snapshotDate));
  if (existing) {
    const [updated] = await db.update(usageSnapshots).set({
      source: input.source || existing.source,
      requests: input.requests,
      errors: input.errors,
      p95Ms: input.p95Ms,
      dbStorageMb: input.dbStorageMb,
      taskCount: input.taskCount,
      attachmentBytes: input.attachmentBytes,
      spendMtdCents: input.spendMtdCents,
    }).where(eq(usageSnapshots.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db.insert(usageSnapshots).values({
    id: randomUUID(),
    snapshotDate: input.snapshotDate,
    source: input.source || "internal",
    requests: input.requests,
    errors: input.errors,
    p95Ms: input.p95Ms,
    dbStorageMb: input.dbStorageMb,
    taskCount: input.taskCount,
    attachmentBytes: input.attachmentBytes,
    spendMtdCents: input.spendMtdCents,
  }).returning();
  return created;
}

export async function getUsageSnapshots(limit = 30): Promise<UsageSnapshot[]> {
  return db.select().from(usageSnapshots).orderBy(desc(usageSnapshots.snapshotDate)).limit(limit);
}

export async function hasImportFingerprint(userId: string, fingerprint: string): Promise<boolean> {
  const [row] = await db.select({ value: count() })
    .from(taskImportFingerprints)
    .where(and(eq(taskImportFingerprints.userId, userId), eq(taskImportFingerprints.fingerprint, fingerprint)));
  return (Number(row?.value) || 0) > 0;
}

export async function recordImportFingerprint(userId: string, fingerprint: string, source: string, firstTaskId?: string): Promise<void> {
  await db.insert(taskImportFingerprints).values({
    id: randomUUID(),
    userId,
    fingerprint,
    source,
    firstTaskId: firstTaskId || null,
  }).onConflictDoNothing();
}

// ─── Invoicing, MFA, Idempotency ────────────────────────────────────────────
function hashMfaCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function createMfaChallenge(userId: string, purpose: string, ttlMinutes = 10): Promise<{ challengeId: string; code: string; expiresAt: Date }> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const challengeId = randomUUID();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await db.insert(mfaChallenges).values({
    id: challengeId,
    userId,
    purpose,
    codeHash: hashMfaCode(code),
    expiresAt,
  });
  return { challengeId, code, expiresAt };
}

export async function verifyMfaChallenge(userId: string, challengeId: string, code: string): Promise<boolean> {
  const [challenge] = await db.select().from(mfaChallenges).where(and(
    eq(mfaChallenges.id, challengeId),
    eq(mfaChallenges.userId, userId),
  ));
  if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) return false;
  if (challenge.attempts >= 5) return false;

  const valid = challenge.codeHash === hashMfaCode(code);
  if (!valid) {
    await db.update(mfaChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(mfaChallenges.id, challenge.id));
    return false;
  }

  await db.update(mfaChallenges).set({ consumedAt: new Date() }).where(eq(mfaChallenges.id, challenge.id));
  return true;
}

export async function createInvoice(input: {
  userId: string;
  invoiceNumber: string;
  amountCents: number;
  currency?: string;
  dueDate?: string;
  metadataJson?: string;
}): Promise<Invoice> {
  const [invoice] = await db.insert(invoices).values({
    id: randomUUID(),
    userId: input.userId,
    invoiceNumber: input.invoiceNumber,
    amountCents: input.amountCents,
    currency: (input.currency || "USD").toUpperCase(),
    status: "draft",
    dueDate: input.dueDate || null,
    metadataJson: input.metadataJson || null,
  }).returning();
  await db.insert(invoiceEvents).values({
    id: randomUUID(),
    invoiceId: invoice.id,
    actorUserId: input.userId,
    eventType: "created",
    details: "Invoice created",
  });
  return invoice;
}

export async function issueInvoice(invoiceId: string, actorUserId: string): Promise<Invoice | undefined> {
  const [invoice] = await db.update(invoices).set({ status: "issued", issuedAt: new Date(), updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId))
    .returning();
  if (!invoice) return undefined;
  await db.insert(invoiceEvents).values({
    id: randomUUID(),
    invoiceId,
    actorUserId,
    eventType: "issued",
    details: "Invoice issued",
  });
  return invoice;
}

export async function confirmInvoicePayment(invoiceId: string, actorUserId: string, confirmationNumber: string, externalReference?: string): Promise<Invoice | undefined> {
  const [invoice] = await db.update(invoices).set({
    status: "paid",
    confirmationNumber,
    externalReference: externalReference || null,
    paidAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(invoices.id, invoiceId)).returning();
  if (!invoice) return undefined;
  await db.insert(invoiceEvents).values({
    id: randomUUID(),
    invoiceId,
    actorUserId,
    eventType: "paid",
    details: `Payment confirmed: ${confirmationNumber}`,
  });
  return invoice;
}

export async function listInvoices(limit = 100): Promise<Invoice[]> {
  return db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(limit);
}

export async function listInvoiceEvents(invoiceId: string): Promise<InvoiceEvent[]> {
  return db.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoiceId)).orderBy(desc(invoiceEvents.createdAt));
}

export async function ensureIdempotencyKey(key: string, route: string, userId?: string): Promise<{ fresh: boolean }> {
  const [existing] = await db.select().from(idempotencyKeys).where(and(
    eq(idempotencyKeys.key, key),
    eq(idempotencyKeys.route, route),
  ));
  if (existing) return { fresh: false };
  await db.insert(idempotencyKeys).values({
    id: randomUUID(),
    key,
    route,
    userId: userId || null,
  });
  return { fresh: true };
}

// ─── Premium + Retention Layer ───────────────────────────────────────────────
export const PREMIUM_CATALOG = {
  assumptions: {
    currency: "USD",
    billingCadence: ["monthly", "yearly"],
    defaultGraceDays: 14,
    objective: "retention",
  },
  plans: [
    {
      product: "axtask",
      planKey: "axtask_pro_monthly",
      monthlyPriceUsd: 12,
      features: ["saved_smart_views", "review_workflows", "weekly_digest"],
    },
    {
      product: "nodeweaver",
      planKey: "nodeweaver_pro_monthly",
      monthlyPriceUsd: 19,
      features: ["classification_history_replay", "confidence_drift_alerts", "weekly_digest"],
    },
    {
      product: "bundle",
      planKey: "power_bundle_monthly",
      monthlyPriceUsd: 25,
      features: [
        "saved_smart_views",
        "review_workflows",
        "classification_history_replay",
        "confidence_drift_alerts",
        "bundle_auto_reprioritize",
        "cross_product_digest",
      ],
      discountPercentVsSeparate: 19,
    },
  ],
} as const;

export type PremiumEntitlements = {
  userId: string;
  planKeys: string[];
  products: string[];
  inGracePeriod: boolean;
  graceUntil: Date | null;
  features: string[];
};

const PREMIUM_FEATURE_MATRIX: Record<string, string[]> = {
  axtask_pro_monthly: ["saved_smart_views", "review_workflows", "weekly_digest"],
  axtask_pro_yearly: ["saved_smart_views", "review_workflows", "weekly_digest"],
  nodeweaver_pro_monthly: ["classification_history_replay", "confidence_drift_alerts", "weekly_digest"],
  nodeweaver_pro_yearly: ["classification_history_replay", "confidence_drift_alerts", "weekly_digest"],
  power_bundle_monthly: [
    "saved_smart_views",
    "review_workflows",
    "weekly_digest",
    "classification_history_replay",
    "confidence_drift_alerts",
    "bundle_auto_reprioritize",
    "cross_product_digest",
  ],
  power_bundle_yearly: [
    "saved_smart_views",
    "review_workflows",
    "weekly_digest",
    "classification_history_replay",
    "confidence_drift_alerts",
    "bundle_auto_reprioritize",
    "cross_product_digest",
  ],
};

export async function trackPremiumEvent(input: {
  userId?: string;
  eventName: string;
  product: string;
  planKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<PremiumEvent> {
  const [event] = await db.insert(premiumEvents).values({
    id: randomUUID(),
    userId: input.userId || null,
    eventName: input.eventName,
    product: input.product,
    planKey: input.planKey || null,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
  }).returning();
  return event;
}

export async function listPremiumSubscriptions(userId: string): Promise<PremiumSubscription[]> {
  return db.select()
    .from(premiumSubscriptions)
    .where(eq(premiumSubscriptions.userId, userId))
    .orderBy(desc(premiumSubscriptions.updatedAt));
}

export async function getPremiumEntitlements(userId: string): Promise<PremiumEntitlements> {
  const subs = await listPremiumSubscriptions(userId);
  const now = new Date();
  const activeOrGrace = subs.filter((sub) => {
    if (sub.status === "active") return true;
    if (sub.status === "grace" && sub.graceUntil && new Date(sub.graceUntil) > now) return true;
    return false;
  });

  const planKeys = activeOrGrace.map((s) => s.planKey);
  const products = Array.from(new Set(activeOrGrace.map((s) => s.product)));
  const features = Array.from(new Set(planKeys.flatMap((k) => PREMIUM_FEATURE_MATRIX[k] || [])));
  const graceRows = activeOrGrace.filter((s) => s.status === "grace" && s.graceUntil).sort((a, b) => {
    const aTime = a.graceUntil ? new Date(a.graceUntil).getTime() : 0;
    const bTime = b.graceUntil ? new Date(b.graceUntil).getTime() : 0;
    return bTime - aTime;
  });

  return {
    userId,
    planKeys,
    products,
    features,
    inGracePeriod: graceRows.length > 0,
    graceUntil: graceRows[0]?.graceUntil || null,
  };
}

export async function upsertPremiumSubscription(input: {
  userId: string;
  product: "axtask" | "nodeweaver" | "bundle";
  planKey: string;
  status: "active" | "grace" | "inactive";
  graceUntil?: Date | null;
  metadata?: Record<string, unknown>;
}): Promise<PremiumSubscription> {
  const [existing] = await db.select().from(premiumSubscriptions).where(and(
    eq(premiumSubscriptions.userId, input.userId),
    eq(premiumSubscriptions.product, input.product),
    eq(premiumSubscriptions.planKey, input.planKey),
  ));
  if (existing) {
    const [updated] = await db.update(premiumSubscriptions).set({
      status: input.status,
      graceUntil: input.graceUntil || null,
      reactivatedAt: input.status === "active" ? new Date() : existing.reactivatedAt,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : existing.metadataJson,
      updatedAt: new Date(),
    }).where(eq(premiumSubscriptions.id, existing.id)).returning();
    return updated;
  }
  const [created] = await db.insert(premiumSubscriptions).values({
    id: randomUUID(),
    userId: input.userId,
    product: input.product,
    planKey: input.planKey,
    status: input.status,
    graceUntil: input.graceUntil || null,
    downgradedAt: input.status === "grace" ? new Date() : null,
    reactivatedAt: input.status === "active" ? new Date() : null,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
  }).returning();
  return created;
}

export async function downgradePremiumToGrace(userId: string, product: "axtask" | "nodeweaver" | "bundle", days = 14): Promise<PremiumSubscription | null> {
  const [existing] = await db.select().from(premiumSubscriptions).where(and(
    eq(premiumSubscriptions.userId, userId),
    eq(premiumSubscriptions.product, product),
    or(eq(premiumSubscriptions.status, "active"), eq(premiumSubscriptions.status, "grace")),
  )).orderBy(desc(premiumSubscriptions.updatedAt)).limit(1);

  if (!existing) return null;
  const graceUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const [updated] = await db.update(premiumSubscriptions).set({
    status: "grace",
    graceUntil,
    downgradedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(premiumSubscriptions.id, existing.id)).returning();
  await trackPremiumEvent({
    userId,
    eventName: "premium_downgrade_grace_started",
    product,
    planKey: updated.planKey,
    metadata: { graceDays: days, graceUntil: graceUntil.toISOString() },
  });
  return updated;
}

export async function reactivatePremium(userId: string, product: "axtask" | "nodeweaver" | "bundle"): Promise<PremiumSubscription | null> {
  const [existing] = await db.select().from(premiumSubscriptions).where(and(
    eq(premiumSubscriptions.userId, userId),
    eq(premiumSubscriptions.product, product),
  )).orderBy(desc(premiumSubscriptions.updatedAt)).limit(1);
  if (!existing) return null;
  const [updated] = await db.update(premiumSubscriptions).set({
    status: "active",
    graceUntil: null,
    reactivatedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(premiumSubscriptions.id, existing.id)).returning();
  await trackPremiumEvent({
    userId,
    eventName: "premium_reactivated",
    product,
    planKey: updated.planKey,
  });
  return updated;
}

export async function listPremiumSavedViews(userId: string): Promise<PremiumSavedView[]> {
  return db.select().from(premiumSavedViews).where(eq(premiumSavedViews.userId, userId)).orderBy(desc(premiumSavedViews.updatedAt));
}

export async function createPremiumSavedView(input: {
  userId: string;
  name: string;
  filtersJson: string;
  autoRefreshMinutes?: number;
}): Promise<PremiumSavedView> {
  const [view] = await db.insert(premiumSavedViews).values({
    id: randomUUID(),
    userId: input.userId,
    name: input.name,
    filtersJson: input.filtersJson,
    autoRefreshMinutes: input.autoRefreshMinutes ?? 15,
  }).returning();
  await trackPremiumEvent({
    userId: input.userId,
    eventName: "premium_saved_view_created",
    product: "axtask",
    metadata: { savedViewId: view.id },
  });
  return view;
}

export async function updatePremiumSavedView(input: {
  userId: string;
  id: string;
  name?: string;
  filtersJson?: string;
  autoRefreshMinutes?: number;
  lastOpenedAt?: Date;
}): Promise<PremiumSavedView | undefined> {
  const [view] = await db.update(premiumSavedViews).set({
    name: input.name,
    filtersJson: input.filtersJson,
    autoRefreshMinutes: input.autoRefreshMinutes,
    lastOpenedAt: input.lastOpenedAt,
    updatedAt: new Date(),
  }).where(and(eq(premiumSavedViews.id, input.id), eq(premiumSavedViews.userId, input.userId))).returning();
  return view;
}

export async function deletePremiumSavedView(userId: string, id: string): Promise<boolean> {
  const result = await db.delete(premiumSavedViews).where(and(
    eq(premiumSavedViews.id, id),
    eq(premiumSavedViews.userId, userId),
  ));
  return (result.rowCount || 0) > 0;
}

export async function setDefaultPremiumSavedView(userId: string, id: string): Promise<void> {
  await db.update(premiumSavedViews).set({ isDefault: false, updatedAt: new Date() }).where(eq(premiumSavedViews.userId, userId));
  await db.update(premiumSavedViews).set({ isDefault: true, updatedAt: new Date() }).where(and(
    eq(premiumSavedViews.userId, userId),
    eq(premiumSavedViews.id, id),
  ));
  await trackPremiumEvent({
    userId,
    eventName: "premium_saved_view_default_set",
    product: "axtask",
    metadata: { savedViewId: id },
  });
}

export async function listPremiumReviewWorkflows(userId: string): Promise<PremiumReviewWorkflow[]> {
  return db.select().from(premiumReviewWorkflows).where(eq(premiumReviewWorkflows.userId, userId)).orderBy(desc(premiumReviewWorkflows.updatedAt));
}

export async function createPremiumReviewWorkflow(input: {
  userId: string;
  name: string;
  cadence: "daily" | "weekly" | "monthly";
  criteriaJson: string;
  templateJson: string;
  isActive?: boolean;
}): Promise<PremiumReviewWorkflow> {
  const [workflow] = await db.insert(premiumReviewWorkflows).values({
    id: randomUUID(),
    userId: input.userId,
    name: input.name,
    cadence: input.cadence,
    criteriaJson: input.criteriaJson,
    templateJson: input.templateJson,
    isActive: input.isActive ?? true,
  }).returning();
  await trackPremiumEvent({
    userId: input.userId,
    eventName: "premium_review_workflow_created",
    product: "axtask",
    metadata: { workflowId: workflow.id, cadence: workflow.cadence },
  });
  return workflow;
}

export async function updatePremiumReviewWorkflow(input: {
  userId: string;
  id: string;
  name?: string;
  cadence?: "daily" | "weekly" | "monthly";
  criteriaJson?: string;
  templateJson?: string;
  isActive?: boolean;
}): Promise<PremiumReviewWorkflow | undefined> {
  const [workflow] = await db.update(premiumReviewWorkflows).set({
    name: input.name,
    cadence: input.cadence,
    criteriaJson: input.criteriaJson,
    templateJson: input.templateJson,
    isActive: input.isActive,
    updatedAt: new Date(),
  }).where(and(eq(premiumReviewWorkflows.id, input.id), eq(premiumReviewWorkflows.userId, input.userId))).returning();
  return workflow;
}

export async function deletePremiumReviewWorkflow(userId: string, id: string): Promise<boolean> {
  const result = await db.delete(premiumReviewWorkflows).where(and(
    eq(premiumReviewWorkflows.id, id),
    eq(premiumReviewWorkflows.userId, userId),
  ));
  return (result.rowCount || 0) > 0;
}

export async function markPremiumReviewWorkflowRun(userId: string, id: string): Promise<PremiumReviewWorkflow | undefined> {
  const [workflow] = await db.update(premiumReviewWorkflows).set({
    lastRunAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(premiumReviewWorkflows.id, id), eq(premiumReviewWorkflows.userId, userId))).returning();
  if (workflow) {
    await trackPremiumEvent({
      userId,
      eventName: "premium_review_workflow_run",
      product: "axtask",
      metadata: { workflowId: id },
    });
  }
  return workflow;
}

export async function createPremiumInsight(input: {
  userId: string;
  source: "axtask" | "nodeweaver" | "bundle";
  insightType: string;
  title: string;
  body: string;
  severity?: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, unknown>;
}): Promise<PremiumInsight> {
  const [insight] = await db.insert(premiumInsights).values({
    id: randomUUID(),
    userId: input.userId,
    source: input.source,
    insightType: input.insightType,
    title: input.title,
    body: input.body,
    severity: input.severity || "medium",
    status: "open",
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
  }).returning();
  return insight;
}

export async function listPremiumInsights(userId: string, status?: "open" | "resolved"): Promise<PremiumInsight[]> {
  if (status) {
    return db.select().from(premiumInsights).where(and(
      eq(premiumInsights.userId, userId),
      eq(premiumInsights.status, status),
    )).orderBy(desc(premiumInsights.createdAt));
  }
  return db.select().from(premiumInsights).where(eq(premiumInsights.userId, userId)).orderBy(desc(premiumInsights.createdAt));
}

export async function resolvePremiumInsight(userId: string, insightId: string): Promise<PremiumInsight | undefined> {
  const [insight] = await db.update(premiumInsights).set({
    status: "resolved",
    resolvedAt: new Date(),
  }).where(and(eq(premiumInsights.id, insightId), eq(premiumInsights.userId, userId))).returning();
  return insight;
}

export async function buildWeeklyPremiumDigest(userId: string): Promise<{
  generatedAt: string;
  taskSummary: {
    total: number;
    completed: number;
    overdue: number;
    highPriorityOpen: number;
  };
  insightsOpen: number;
  recommendations: string[];
}> {
  const allTasks = await storage.getTasks(userId);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const completed = allTasks.filter((task) => task.status === "completed").length;
  const overdue = allTasks.filter((task) => task.status !== "completed" && task.date < today).length;
  const highPriorityOpen = allTasks.filter((task) =>
    task.status !== "completed" && (task.priority === "High" || task.priority === "Highest"),
  ).length;
  const openInsights = await listPremiumInsights(userId, "open");

  const recommendations: string[] = [];
  if (overdue > 0) recommendations.push(`Clear ${overdue} overdue tasks using a weekly review workflow.`);
  if (highPriorityOpen > 0) recommendations.push(`Focus top ${Math.min(highPriorityOpen, 5)} high-priority tasks first.`);
  if (openInsights.length > 0) recommendations.push(`Resolve ${openInsights.length} premium insights to improve consistency.`);
  if (recommendations.length === 0) recommendations.push("Momentum is healthy. Keep the current execution cadence.");

  return {
    generatedAt: now.toISOString(),
    taskSummary: {
      total: allTasks.length,
      completed,
      overdue,
      highPriorityOpen,
    },
    insightsOpen: openInsights.length,
    recommendations,
  };
}

export async function getPremiumRetentionMetrics(days = 30): Promise<{
  windowDays: number;
  totals: {
    activePremiumUsers: number;
    graceUsers: number;
    weeklyDigestRuns: number;
    savedViewEvents: number;
    workflowRunEvents: number;
  };
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [activeRows, graceRows, digestRows, savedViewRows, workflowRows] = await Promise.all([
    db.select({ value: count() }).from(premiumSubscriptions).where(eq(premiumSubscriptions.status, "active")),
    db.select({ value: count() }).from(premiumSubscriptions).where(eq(premiumSubscriptions.status, "grace")),
    db.select({ value: count() }).from(premiumEvents).where(and(
      eq(premiumEvents.eventName, "premium_weekly_digest_generated"),
      sql`${premiumEvents.createdAt} >= ${since}`,
    )),
    db.select({ value: count() }).from(premiumEvents).where(and(
      eq(premiumEvents.eventName, "premium_saved_view_created"),
      sql`${premiumEvents.createdAt} >= ${since}`,
    )),
    db.select({ value: count() }).from(premiumEvents).where(and(
      eq(premiumEvents.eventName, "premium_review_workflow_run"),
      sql`${premiumEvents.createdAt} >= ${since}`,
    )),
  ]);
  return {
    windowDays: days,
    totals: {
      activePremiumUsers: Number(activeRows[0]?.value) || 0,
      graceUsers: Number(graceRows[0]?.value) || 0,
      weeklyDigestRuns: Number(digestRows[0]?.value) || 0,
      savedViewEvents: Number(savedViewRows[0]?.value) || 0,
      workflowRunEvents: Number(workflowRows[0]?.value) || 0,
    },
  };
}