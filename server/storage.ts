import {
  tasks,
  users,
  passwordResetTokens,
  securityLogs,
  securityEvents,
  securityAlerts,
  appeals,
  appealVotes,
  wallets,
  coinTransactions,
  userBadges,
  rewardsCatalog,
  userRewards,
  userMilestoneGrants,
  userEntourage,
  userYoutubeProbeState,
  youtubeProbeFeedback,
  avatarProfiles,
  avatarXpEvents,
  taskCollaborators,
  taskPatterns,
  classificationContributions,
  classificationConfirmations,
  userClassificationCategories,
  offlineGenerators,
  offlineSkillNodes,
  userOfflineSkills,
  usageSnapshots,
  productFunnelEvents,
  storagePolicies,
  attachmentAssets,
  taskImportFingerprints,
  invoices,
  invoiceEvents,
  mfaChallenges,
  billingPaymentMethods,
  userBillingProfiles,
  idempotencyKeys,
  premiumSubscriptions,
  premiumSavedViews,
  premiumReviewWorkflows,
  premiumInsights,
  premiumEvents,
  userNotificationPreferences,
  userPushSubscriptions,
  type Task,
  type InsertTask,
  type UpdateTask,
  type User,
  type SafeUser,
  type SecurityLog,
  type SecurityEvent,
  type SecurityAlert,
  type Wallet,
  type CoinTransaction,
  type UserBadge,
  type RewardItem,
  type TaskCollaborator,
  type TaskPattern,
  type InsertTaskPattern,
  type ClassificationContribution,
  type ClassificationConfirmation,
  type UserClassificationCategory,
  type OfflineGenerator,
  type OfflineSkillNode,
  type UserOfflineSkill,
  type UsageSnapshot,
  type StoragePolicy,
  type AttachmentAsset,
  type Invoice,
  type InvoiceEvent,
  type BillingPaymentMethod,
  type UserBillingProfile,
  type PremiumSubscription,
  type PremiumSavedView,
  type PremiumReviewWorkflow,
  type PremiumInsight,
  type PremiumEvent,
  type UserNotificationPreference,
  type UserPushSubscription,
  type Appeal,
  type UserEntourage,
  type UserYoutubeProbeState,
  type YoutubeProbeFeedback,
  type AvatarProfile,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike, or, asc, lt, gt, gte, count, avg, sql, desc, inArray, notInArray, isNull } from "drizzle-orm";
import { computeAppealVoteThreshold, evaluateAppealOutcome } from "./lib/appeal-vote-rules";
import { computeCompoundContributorBonus, getMaxCompoundPeriods } from "./lib/classification-compound";
import { randomUUID, randomBytes, createHash } from "crypto";
import bcrypt from "bcrypt";
import { buildSecurityEventHash } from "./security/event-hash";
import { parseFeedbackPayload, parseFeedbackReviewPayload } from "./services/feedback-inbox-parser";

/** Allowed clock skew / serialization delta for task optimistic concurrency (updatedAt match). */

/** RFC 4122 string form (any version/variant); rejects malformed client-supplied ids. */
const CLIENT_TASK_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidClientTaskUuid(id: string): boolean {
  return CLIENT_TASK_ID_UUID_RE.test(id);
}
import { maskE164ForDisplay } from "@shared/phone";
import {
  isBuiltInClassification,
  normalizeCategoryName,
  formatCategoryNameForStorage,
} from "@shared/classification-catalog";
import { getNotificationDispatchProfile, shouldDispatchByIntensity, type NotificationDispatchProfile } from "./services/notification-intensity";
import { computeLazyAvatarXp } from "./services/gamification/lazy-avatar-xp";

// ─── User helpers ────────────────────────────────────────────────────────────
function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function toSafeUser(user: User): SafeUser {
  const {
    passwordHash,
    securityAnswerHash,
    failedLoginAttempts,
    lockedUntil,
    workosId,
    googleId,
    replitId,
    phoneE164,
    birthDate: _birthDate,
    ...rest
  } = user;
  return {
    ...rest,
    phoneMasked: maskE164ForDisplay(phoneE164),
    phoneVerified: !!user.phoneVerifiedAt,
  };
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

/** Owner-only profile fields not included in `SafeUser` session payloads. */
export async function getAccountOwnerProfileFields(
  userId: string,
): Promise<{ displayName: string | null; birthDate: string | null } | undefined> {
  const [row] = await db
    .select({ displayName: users.displayName, birthDate: users.birthDate })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? undefined;
}

export async function updateUserAccountProfile(
  userId: string,
  patch: { displayName?: string | null; birthDate?: string | null },
): Promise<SafeUser | undefined> {
  if (patch.displayName !== undefined) {
    await db.update(users).set({ displayName: patch.displayName }).where(eq(users.id, userId));
  }
  if (patch.birthDate !== undefined) {
    const [row] = await db
      .update(users)
      .set({ birthDate: patch.birthDate })
      .where(and(eq(users.id, userId), isNull(users.birthDate)))
      .returning({ id: users.id });
    if (!row) {
      console.warn("[storage] updateUserAccountProfile: ignoring birthDate change (already set)");
    }
  }
  return getUserById(userId);
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
    immersiveSoundsEnabled: row?.immersiveSoundsEnabled ?? false,
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
  immersiveSoundsEnabled?: boolean;
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
      immersiveSoundsEnabled: input.immersiveSoundsEnabled ?? existing.immersiveSoundsEnabled,
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
        immersiveSoundsEnabled: input.immersiveSoundsEnabled ?? existing.immersiveSoundsEnabled,
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

export type DemoteAdminResult =
  | "ok"
  | "not_found"
  | "not_admin"
  | "self"
  | "last_admin"
  | "actor_not_admin";

/** Serialize admin demotions so concurrent last-admin checks stay consistent. */
const ADVISORY_LOCK_ADMIN_DEMOTE = 928_471;

/**
 * Remove admin role from another user (decommission admin privileges — account remains).
 * Cannot demote self; cannot remove the last admin (use DB break-glass to recover).
 */
export async function demoteAdminUser(
  targetUserId: string,
  demotedByUserId: string,
  reason: string,
  ipAddress?: string,
): Promise<DemoteAdminResult> {
  if (targetUserId === demotedByUserId) return "self";

  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_ADMIN_DEMOTE})`);
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, demotedByUserId));
    if (!actor || actor.role !== "admin") return "actor_not_admin" as const;
    const [row] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, targetUserId));
    if (!row) return "not_found" as const;
    if (row.role !== "admin") return "not_admin" as const;
    const [cnt] = await tx.select({ value: count() }).from(users).where(eq(users.role, "admin"));
    const adminCount = Number(cnt?.value) || 0;
    if (adminCount <= 1) return "last_admin" as const;
    await tx.update(users).set({ role: "user" }).where(eq(users.id, targetUserId));
    return "ok" as const;
  });

  if (outcome === "ok") {
    await logSecurityEvent("admin_demoted", demotedByUserId, targetUserId, ipAddress, reason.trim());
  }
  return outcome;
}

export async function countAdmins(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(users).where(eq(users.role, "admin"));
  return Number(row?.value) || 0;
}

const APPEAL_SUBJECT_TYPES = ["account_ban", "feedback_dispute", "other"] as const;
export type AppealSubjectType = (typeof APPEAL_SUBJECT_TYPES)[number];

export function isAppealSubjectType(s: string): s is AppealSubjectType {
  return (APPEAL_SUBJECT_TYPES as readonly string[]).includes(s);
}

export async function createAppeal(input: {
  appellantUserId: string;
  subjectType: AppealSubjectType;
  subjectRef: string;
  title: string;
  body: string;
}): Promise<Appeal | null> {
  if (input.subjectType === "account_ban") {
    if (input.subjectRef !== input.appellantUserId) return null;
    const [u] = await db.select({ isBanned: users.isBanned }).from(users).where(eq(users.id, input.appellantUserId));
    if (!u?.isBanned) return null;
  }
  if (input.subjectType === "feedback_dispute") {
    const [ev] = await db
      .select({ id: securityEvents.id, eventType: securityEvents.eventType, actorUserId: securityEvents.actorUserId })
      .from(securityEvents)
      .where(eq(securityEvents.id, input.subjectRef));
    if (!ev || ev.eventType !== "feedback_processed" || ev.actorUserId !== input.appellantUserId) return null;
  }

  const adminCountAtOpen = await countAdmins();
  const [row] = await db
    .insert(appeals)
    .values({
      id: randomUUID(),
      appellantUserId: input.appellantUserId,
      subjectType: input.subjectType,
      subjectRef: input.subjectRef,
      title: input.title.trim(),
      body: input.body.trim(),
      status: "open",
      adminCountAtOpen,
    })
    .returning();
  await logSecurityEvent("appeal_submitted", input.appellantUserId, undefined, undefined, `appeal ${row.id} · ${input.subjectType}`);
  return row;
}

export async function listAppealsForUser(appellantUserId: string, limit = 50): Promise<Appeal[]> {
  return db
    .select()
    .from(appeals)
    .where(eq(appeals.appellantUserId, appellantUserId))
    .orderBy(desc(appeals.createdAt))
    .limit(Math.min(limit, 100));
}

export type AppealListRow = Appeal & {
  grantVotes: number;
  denyVotes: number;
  threshold: ReturnType<typeof computeAppealVoteThreshold>;
};

export async function listAppealsForAdmin(limit = 100): Promise<AppealListRow[]> {
  const rows = await db.select().from(appeals).orderBy(desc(appeals.createdAt)).limit(Math.min(limit, 200));
  const adminCount = await countAdmins();
  const threshold = computeAppealVoteThreshold(adminCount);
  const ids = rows.map((r) => r.id);
  const voteCounts = new Map<string, number>();
  if (ids.length > 0) {
    const agg = await db
      .select({
        appealId: appealVotes.appealId,
        decision: appealVotes.decision,
        cnt: count(),
      })
      .from(appealVotes)
      .where(inArray(appealVotes.appealId, ids))
      .groupBy(appealVotes.appealId, appealVotes.decision);
    for (const row of agg) {
      voteCounts.set(`${row.appealId}:${row.decision}`, Number(row.cnt) || 0);
    }
  }
  return rows.map((a) => ({
    ...a,
    grantVotes: voteCounts.get(`${a.id}:grant`) ?? 0,
    denyVotes: voteCounts.get(`${a.id}:deny`) ?? 0,
    threshold,
  }));
}

export async function withdrawAppeal(appealId: string, appellantUserId: string): Promise<boolean> {
  const [row] = await db.select().from(appeals).where(eq(appeals.id, appealId));
  if (!row || row.appellantUserId !== appellantUserId || row.status !== "open") return false;
  await db
    .update(appeals)
    .set({ status: "withdrawn", resolvedAt: new Date() })
    .where(eq(appeals.id, appealId));
  await logSecurityEvent("appeal_withdrawn", appellantUserId, undefined, undefined, appealId);
  return true;
}

export type CastAppealVoteResult =
  | { status: "not_found" | "not_open" | "not_admin" }
  | { status: "ok"; appeal: Appeal; outcome: "pending" | "grant" | "deny"; autoUnbanned?: boolean };

export async function castAppealVote(input: {
  appealId: string;
  adminUserId: string;
  decision: "grant" | "deny";
}): Promise<CastAppealVoteResult> {
  const [admin] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.adminUserId));
  if (admin?.role !== "admin") return { status: "not_admin" };

  const result = await db.transaction(async (tx): Promise<CastAppealVoteResult> => {
    await tx.execute(sql`SELECT 1 FROM appeals WHERE id = ${input.appealId} FOR UPDATE`);

    const [appeal] = await tx.select().from(appeals).where(eq(appeals.id, input.appealId));
    if (!appeal) return { status: "not_found" };
    if (appeal.status !== "open") return { status: "not_open" };

    const now = new Date();
    await tx
      .insert(appealVotes)
      .values({
        id: randomUUID(),
        appealId: input.appealId,
        adminUserId: input.adminUserId,
        decision: input.decision,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [appealVotes.appealId, appealVotes.adminUserId],
        set: { decision: input.decision, updatedAt: now },
      });

    const [ac] = await tx.select({ value: count() }).from(users).where(eq(users.role, "admin"));
    const adminCount = Number(ac?.value) || 0;

    const [g] = await tx
      .select({ value: count() })
      .from(appealVotes)
      .where(and(eq(appealVotes.appealId, input.appealId), eq(appealVotes.decision, "grant")));
    const [d] = await tx
      .select({ value: count() })
      .from(appealVotes)
      .where(and(eq(appealVotes.appealId, input.appealId), eq(appealVotes.decision, "deny")));
    const grantVotes = Number(g?.value) || 0;
    const denyVotes = Number(d?.value) || 0;

    const verdict = evaluateAppealOutcome(adminCount, grantVotes, denyVotes);
    let autoUnbanned = false;

    if (verdict === "pending") {
      const [fresh] = await tx.select().from(appeals).where(eq(appeals.id, input.appealId));
      return { status: "ok", appeal: fresh!, outcome: "pending" };
    }

    const newStatus = verdict === "grant" ? "granted" : "denied";
    await tx
      .update(appeals)
      .set({
        status: newStatus,
        resolvedAt: now,
        resolvedByUserId: input.adminUserId,
        resolution: verdict === "grant" ? "Appeal granted by admin vote threshold." : "Appeal denied by admin vote threshold.",
      })
      .where(eq(appeals.id, input.appealId));

    if (verdict === "grant" && appeal.subjectType === "account_ban" && appeal.subjectRef === appeal.appellantUserId) {
      await tx
        .update(users)
        .set({
          isBanned: false,
          banReason: null,
          bannedAt: null,
          bannedBy: null,
        })
        .where(eq(users.id, appeal.appellantUserId));
      autoUnbanned = true;
    }

    const [updated] = await tx.select().from(appeals).where(eq(appeals.id, input.appealId));
    return { status: "ok", appeal: updated!, outcome: verdict, autoUnbanned };
  });

  if (result.status === "ok" && result.outcome !== "pending") {
    const suffix = result.autoUnbanned ? " · auto-unbanned" : "";
    await logSecurityEvent(
      "appeal_resolved",
      input.adminUserId,
      result.appeal.appellantUserId,
      undefined,
      `${result.appeal.id} · ${result.outcome}${suffix}`,
    );
  }

  return result;
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
  message?: string;
  channel?: string;
  reporterEmail?: string;
  reporterName?: string;
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
  /** Most recently updated tasks (for probes); avoids loading the full list when only a few snippets are needed. */
  getRecentTasksByUpdatedAt(userId: string, limit: number): Promise<Task[]>;
  getTask(userId: string, id: string): Promise<Task | undefined>;
  /** True if this user already has a task with this primary key (Phase C client-provisioned ids). */
  /** True if any task row exists with this primary key (global uniqueness). */
  isTaskIdTaken(id: string, _userId?: string): Promise<boolean>;
  createTask(userId: string, task: InsertTask): Promise<Task>;
  updateTask(
    userId: string,
    task: UpdateTask,
    options?: { expectUpdatedAt?: string },
  ): Promise<Task | undefined>;
  deleteTask(userId: string, id: string, options?: { expectUpdatedAt?: string }): Promise<boolean>;
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

  async getRecentTasksByUpdatedAt(userId: string, limit: number): Promise<Task[]> {
    const cap = Math.min(Math.max(Math.floor(limit), 1), 50);
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.updatedAt))
      .limit(cap);
  }

  async getTask(userId: string, id: string): Promise<Task | undefined> {
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return task || undefined;
  }

  async isTaskIdTaken(id: string, _userId?: string): Promise<boolean> {
    const [row] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).limit(1);
    return !!row;
  }

  async createTask(userId: string, insertTask: InsertTask): Promise<Task> {
    const { id: clientId, ...rest } = insertTask as InsertTask & { id?: string };
    let id: string;
    if (clientId != null && typeof clientId === "string" && clientId.length > 0) {
      if (!isValidClientTaskUuid(clientId)) {
        throw new Error("Invalid task id: client id must be a valid UUID");
      }
      id = clientId;
    } else {
      id = randomUUID();
    }
    const now = new Date();

    const taskData = {
      ...rest,
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

  async updateTask(
    userId: string,
    updateTask: UpdateTask,
    options?: { expectUpdatedAt?: string },
  ): Promise<Task | undefined> {
    const {
      baseUpdatedAt: _b,
      forceOverwrite: _f,
      visibility: _visibility,
      communityPublishedAt: _communityPublishedAt,
      communityShowNotes: _communityShowNotes,
      communityId: _communityId,
      communityVisibility: _communityVisibility,
      communityTags: _communityTags,
      ...rest
    } = updateTask as UpdateTask & {
      baseUpdatedAt?: unknown;
      forceOverwrite?: unknown;
      communityId?: unknown;
      communityVisibility?: unknown;
      communityTags?: unknown;
    };
    const expect = options?.expectUpdatedAt;
    const expectParsed =
      typeof expect === "string" && expect.trim().length > 0 ? new Date(expect) : null;
    const expectValid = expectParsed !== null && !Number.isNaN(expectParsed.getTime());
    if (expect !== undefined && expect !== null && String(expect).trim().length > 0 && !expectValid) {
      return undefined;
    }
    const expectMs = expectValid ? expectParsed!.getTime() : 0;
    const where = expectValid
      ? and(
          eq(tasks.id, updateTask.id),
          eq(tasks.userId, userId),
          sql`FLOOR(EXTRACT(EPOCH FROM ${tasks.updatedAt}) * 1000) = ${expectMs}`,
        )
      : and(eq(tasks.id, updateTask.id), eq(tasks.userId, userId));
    const [task] = await db
      .update(tasks)
      .set({ ...rest, updatedAt: new Date() })
      .where(where)
      .returning();
    return task || undefined;
  }

  async deleteTask(userId: string, id: string, options?: { expectUpdatedAt?: string }): Promise<boolean> {
    const expect = options?.expectUpdatedAt;
    const expectParsed =
      typeof expect === "string" && expect.trim().length > 0 ? new Date(expect) : null;
    const expectValid = expectParsed !== null && !Number.isNaN(expectParsed.getTime());
    if (expect !== undefined && expect !== null && String(expect).trim().length > 0 && !expectValid) {
      return false;
    }
    const expectMsDel = expectValid ? expectParsed!.getTime() : 0;
    const where = expectValid
      ? and(
          eq(tasks.id, id),
          eq(tasks.userId, userId),
          sql`FLOOR(EXTRACT(EPOCH FROM ${tasks.updatedAt}) * 1000) = ${expectMsDel}`,
        )
      : and(eq(tasks.id, id), eq(tasks.userId, userId));
    const result = await db.delete(tasks).where(where);
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
  await getOrCreateWallet(userId);
  const [updated] = await db
    .update(wallets)
    .set({
      balance: sql`${wallets.balance} + ${amount}`,
      lifetimeEarned: sql`${wallets.lifetimeEarned} + ${amount}`,
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

export async function spendCoins(
  userId: string,
  amount: number,
  reason: string,
  options?: { taskId?: string },
): Promise<Wallet | null> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  await getOrCreateWallet(userId);
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(wallets)
      .set({ balance: sql`${wallets.balance} - ${amount}` })
      .where(and(eq(wallets.userId, userId), sql`${wallets.balance} >= ${amount}`))
      .returning();
    if (!updated) return null;
    await tx.insert(coinTransactions).values({
      id: randomUUID(),
      userId,
      amount: -amount,
      reason,
      ...(options?.taskId ? { taskId: options.taskId } : {}),
    });
    return updated;
  });
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

export async function resetStreak(userId: string): Promise<void> {
  await db
    .update(wallets)
    .set({ currentStreak: 0 })
    .where(eq(wallets.userId, userId));
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

export function isPgUniqueViolation(err: unknown): boolean {
  const o = err as { code?: string; cause?: { code?: string } };
  return o?.code === "23505" || o?.cause?.code === "23505";
}

export async function redeemReward(userId: string, rewardId: string): Promise<boolean> {
  const reward = await getRewardById(rewardId);
  if (!reward) return false;

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ value: count() })
        .from(userRewards)
        .where(and(eq(userRewards.userId, userId), eq(userRewards.rewardId, rewardId)));
      if ((Number(existing?.value) || 0) > 0) return false;

      const [deducted] = await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} - ${reward.cost}` })
        .where(and(eq(wallets.userId, userId), sql`${wallets.balance} >= ${reward.cost}`))
        .returning();
      if (!deducted) return false;

      await tx.insert(coinTransactions).values({
        id: randomUUID(),
        userId,
        amount: -reward.cost,
        reason: `Redeemed: ${reward.name}`,
      });

      await tx.insert(userRewards).values({ id: randomUUID(), userId, rewardId });
      return true;
    });
  } catch (e) {
    if (isPgUniqueViolation(e)) return false;
    throw e;
  }
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

export async function recordProductFunnelEvent(input: {
  userId: string | null;
  eventName: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(productFunnelEvents).values({
    id: randomUUID(),
    userId: input.userId,
    eventName: input.eventName,
    metaJson: input.meta ? JSON.stringify(input.meta) : null,
  });
}

export type ProductFunnelSummaryRow = { eventName: string; day: string; count: number };

export async function getProductFunnelSummary(days: number): Promise<ProductFunnelSummaryRow[]> {
  const d = Math.min(90, Math.max(1, Math.floor(days)));
  const since = new Date(Date.now() - d * 86400000);
  const result = await db.execute(sql`
    SELECT event_name AS "eventName",
           to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
           count(*)::int AS count
    FROM product_funnel_events
    WHERE created_at >= ${since}
    GROUP BY event_name, date_trunc('day', created_at AT TIME ZONE 'UTC')
    ORDER BY date_trunc('day', created_at AT TIME ZONE 'UTC') DESC, event_name
  `);
  return (result.rows as ProductFunnelSummaryRow[]).map((row) => ({
    eventName: String(row.eventName),
    day: String(row.day),
    count: Number(row.count) || 0,
  }));
}

/** Used by spreadsheet import (`routes.ts`) and JSON bundle import (`import-task-dedupe.ts` / migration). */
export async function hasImportFingerprint(userId: string, fingerprint: string): Promise<boolean> {
  const [row] = await db.select({ value: count() })
    .from(taskImportFingerprints)
    .where(and(eq(taskImportFingerprints.userId, userId), eq(taskImportFingerprints.fingerprint, fingerprint)));
  return (Number(row?.value) || 0) > 0;
}

/** First task id recorded for this fingerprint (for 409 conflict payloads). */
export async function getTaskIdForImportFingerprint(
  userId: string,
  fingerprint: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ firstTaskId: taskImportFingerprints.firstTaskId })
    .from(taskImportFingerprints)
    .where(and(eq(taskImportFingerprints.userId, userId), eq(taskImportFingerprints.fingerprint, fingerprint)))
    .limit(1);
  const tid = row?.firstTaskId;
  return typeof tid === "string" && tid.length > 0 ? tid : undefined;
}

/** Persists dedupe keys for imports; sources should match `TaskImportFingerprintSource` in `import-task-dedupe.ts`. */
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

export type MfaDeliveryOptions = {
  ttlMinutes?: number;
  deliveryChannel?: "email" | "sms";
  /** Required when deliveryChannel is sms */
  smsDestinationE164?: string | null;
};

export async function createMfaChallenge(
  userId: string,
  purpose: string,
  options?: MfaDeliveryOptions,
): Promise<{ challengeId: string; code: string; expiresAt: Date }> {
  const ttlMinutes = options?.ttlMinutes ?? 10;
  const deliveryChannel = options?.deliveryChannel ?? "email";
  let smsDestinationE164 = options?.smsDestinationE164 ?? null;
  if (deliveryChannel === "email") {
    smsDestinationE164 = null;
  } else if (!smsDestinationE164?.trim()) {
    throw new Error("SMS challenges require smsDestinationE164");
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const challengeId = randomUUID();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await db.insert(mfaChallenges).values({
    id: challengeId,
    userId,
    purpose,
    codeHash: hashMfaCode(code),
    expiresAt,
    deliveryChannel,
    smsDestinationE164: smsDestinationE164?.trim() || null,
  });
  return { challengeId, code, expiresAt };
}

export async function deleteMfaChallengeById(challengeId: string, userId: string): Promise<void> {
  await db.delete(mfaChallenges).where(and(eq(mfaChallenges.id, challengeId), eq(mfaChallenges.userId, userId)));
}

export async function getUserContactForMfa(userId: string): Promise<{
  email: string;
  phoneE164: string | null;
  phoneVerifiedAt: Date | null;
} | undefined> {
  const [row] = await db.select({
    email: users.email,
    phoneE164: users.phoneE164,
    phoneVerifiedAt: users.phoneVerifiedAt,
  }).from(users).where(eq(users.id, userId));
  return row ?? undefined;
}

export async function setUserVerifiedPhone(userId: string, phoneE164: string): Promise<void> {
  await db.update(users).set({
    phoneE164,
    phoneVerifiedAt: new Date(),
  }).where(eq(users.id, userId));
}

export async function verifyMfaChallengeWithMetadata(
  userId: string,
  challengeId: string,
  code: string,
  expectedPurpose?: string,
): Promise<
  | { ok: false }
  | { ok: true; smsDestinationE164: string | null; deliveryChannel: string }
> {
  const [challenge] = await db.select().from(mfaChallenges).where(and(
    eq(mfaChallenges.id, challengeId),
    eq(mfaChallenges.userId, userId),
  ));
  if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) return { ok: false };
  if (challenge.attempts >= 5) return { ok: false };
  if (expectedPurpose !== undefined && challenge.purpose !== expectedPurpose) return { ok: false };

  const valid = challenge.codeHash === hashMfaCode(code);
  if (!valid) {
    await db.update(mfaChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(mfaChallenges.id, challenge.id));
    return { ok: false };
  }

  const smsDestinationE164 = challenge.smsDestinationE164;
  const deliveryChannel = challenge.deliveryChannel;

  await db.update(mfaChallenges).set({ consumedAt: new Date() }).where(eq(mfaChallenges.id, challenge.id));

  return {
    ok: true,
    smsDestinationE164,
    deliveryChannel,
  };
}

export async function verifyMfaChallenge(
  userId: string,
  challengeId: string,
  code: string,
  expectedPurpose?: string,
): Promise<boolean> {
  const [challenge] = await db.select().from(mfaChallenges).where(and(
    eq(mfaChallenges.id, challengeId),
    eq(mfaChallenges.userId, userId),
  ));
  if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) return false;
  if (challenge.attempts >= 5) return false;
  if (expectedPurpose !== undefined && challenge.purpose !== expectedPurpose) return false;

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

export async function listBillingPaymentMethodsForUser(userId: string): Promise<BillingPaymentMethod[]> {
  return db.select().from(billingPaymentMethods)
    .where(eq(billingPaymentMethods.userId, userId))
    .orderBy(desc(billingPaymentMethods.createdAt));
}

export async function createBillingPaymentMethod(input: {
  userId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  country?: string;
  postalCode?: string;
  isDefault: boolean;
}): Promise<BillingPaymentMethod> {
  if (input.isDefault) {
    await db.update(billingPaymentMethods)
      .set({ isDefault: false })
      .where(eq(billingPaymentMethods.userId, input.userId));
  }
  const [row] = await db.insert(billingPaymentMethods).values({
    id: randomUUID(),
    userId: input.userId,
    brand: input.brand,
    last4: input.last4,
    expMonth: input.expMonth,
    expYear: input.expYear,
    country: input.country || null,
    postalCode: input.postalCode || null,
    isDefault: input.isDefault,
  }).returning();
  return row;
}

export async function deleteBillingPaymentMethodForUser(
  userId: string,
  paymentMethodId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(billingPaymentMethods)
      .where(and(eq(billingPaymentMethods.id, paymentMethodId), eq(billingPaymentMethods.userId, userId)));
    if (!row) return false;
    const wasDefault = row.isDefault;
    await tx.delete(billingPaymentMethods).where(eq(billingPaymentMethods.id, paymentMethodId));
    if (wasDefault) {
      const [next] = await tx
        .select()
        .from(billingPaymentMethods)
        .where(eq(billingPaymentMethods.userId, userId))
        .orderBy(desc(billingPaymentMethods.createdAt))
        .limit(1);
      if (next) {
        await tx
          .update(billingPaymentMethods)
          .set({ isDefault: true })
          .where(eq(billingPaymentMethods.id, next.id));
      }
    }
    return true;
  });
}

export async function getUserBillingProfile(userId: string): Promise<UserBillingProfile | undefined> {
  const [row] = await db.select().from(userBillingProfiles).where(eq(userBillingProfiles.userId, userId));
  return row;
}

const BILLING_PROFILE_PATCH_KEYS = [
  "legalName",
  "line1",
  "line2",
  "city",
  "region",
  "postalCode",
  "country",
] as const;

export type BillingProfilePatchInput = Partial<
  Record<(typeof BILLING_PROFILE_PATCH_KEYS)[number], string | null>
>;

/**
 * Atomic upsert: only keys present on `input` (including explicit `null`) are written on conflict;
 * omitted keys are left unchanged on update. On first insert, unspecified columns are null.
 */
export async function upsertUserBillingProfile(
  userId: string,
  input: BillingProfilePatchInput,
): Promise<UserBillingProfile> {
  const now = new Date();
  const insertRow = {
    userId,
    legalName: null as string | null,
    line1: null as string | null,
    line2: null as string | null,
    city: null as string | null,
    region: null as string | null,
    postalCode: null as string | null,
    country: null as string | null,
    updatedAt: now,
  };
  const updateSet: Record<string, string | null | Date> = { updatedAt: now };
  for (const key of BILLING_PROFILE_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const v = input[key];
      insertRow[key] = v ?? null;
      updateSet[key] = v ?? null;
    }
  }
  const [row] = await db
    .insert(userBillingProfiles)
    .values(insertRow)
    .onConflictDoUpdate({
      target: userBillingProfiles.userId,
      set: updateSet,
    })
    .returning();
  return row;
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

export async function getInvoiceForUser(
  invoiceId: string,
  userId: string,
): Promise<Invoice | undefined> {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
  return row;
}

export async function issueInvoice(invoiceId: string, actorUserId: string): Promise<Invoice | undefined> {
  const [invoice] = await db
    .update(invoices)
    .set({ status: "issued", issuedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, actorUserId)))
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
  const [invoice] = await db
    .update(invoices)
    .set({
      status: "paid",
      confirmationNumber,
      externalReference: externalReference || null,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, actorUserId)))
    .returning();
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

/** Invoices for a single user (never use unscoped list for authenticated API responses). */
export async function listInvoicesForUser(userId: string, limit = 100): Promise<Invoice[]> {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.userId, userId))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);
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

export const PREMIUM_FEATURE_MATRIX: Record<string, string[]> = {
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
  axtask_lifetime: ["saved_smart_views", "review_workflows", "weekly_digest"],
  nodeweaver_lifetime: ["classification_history_replay", "confidence_drift_alerts", "weekly_digest"],
  power_bundle_lifetime: [
    "saved_smart_views",
    "review_workflows",
    "weekly_digest",
    "classification_history_replay",
    "confidence_drift_alerts",
    "bundle_auto_reprioritize",
    "cross_product_digest",
  ],
};

/** Plan keys reserved for admin-granted lifetime access (no renewal; `endsAt` stays null). */
export const LIFETIME_PLAN_KEYS: Record<"axtask" | "nodeweaver" | "bundle", string> = {
  axtask: "axtask_lifetime",
  nodeweaver: "nodeweaver_lifetime",
  bundle: "power_bundle_lifetime",
};

const LIFETIME_PLAN_KEY_LIST = Object.values(LIFETIME_PLAN_KEYS);

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

function premiumSubscriptionIsTimeValid(sub: PremiumSubscription, now: Date): boolean {
  if (sub.endsAt && new Date(sub.endsAt) <= now) return false;
  return true;
}

export async function getPremiumEntitlements(userId: string): Promise<PremiumEntitlements> {
  const subs = await listPremiumSubscriptions(userId);
  const now = new Date();
  const activeOrGrace = subs.filter((sub) => {
    if (sub.status === "grace" && sub.graceUntil && new Date(sub.graceUntil) > now) return true;
    if (!premiumSubscriptionIsTimeValid(sub, now)) return false;
    if (sub.status === "active") return true;
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

type PremiumUpsertInput = {
  userId: string;
  product: "axtask" | "nodeweaver" | "bundle";
  planKey: string;
  status: "active" | "grace" | "inactive";
  graceUntil?: Date | null;
  endsAt?: Date | null;
  metadata?: Record<string, unknown>;
};

type DbLike = Pick<typeof db, "select" | "insert" | "update">;

async function upsertPremiumSubscriptionWithDb(
  d: DbLike,
  input: PremiumUpsertInput,
): Promise<PremiumSubscription> {
  const [existing] = await d.select().from(premiumSubscriptions).where(and(
    eq(premiumSubscriptions.userId, input.userId),
    eq(premiumSubscriptions.product, input.product),
    eq(premiumSubscriptions.planKey, input.planKey),
  ));
  if (existing) {
    const [updated] = await d.update(premiumSubscriptions).set({
      status: input.status,
      graceUntil: input.graceUntil !== undefined ? input.graceUntil : existing.graceUntil,
      endsAt: input.endsAt !== undefined ? input.endsAt : existing.endsAt,
      reactivatedAt: input.status === "active" ? new Date() : existing.reactivatedAt,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : existing.metadataJson,
      updatedAt: new Date(),
    }).where(eq(premiumSubscriptions.id, existing.id)).returning();
    return updated;
  }
  const [created] = await d.insert(premiumSubscriptions).values({
    id: randomUUID(),
    userId: input.userId,
    product: input.product,
    planKey: input.planKey,
    status: input.status,
    graceUntil: input.graceUntil ?? null,
    endsAt: input.endsAt !== undefined ? input.endsAt : null,
    downgradedAt: input.status === "grace" ? new Date() : null,
    reactivatedAt: input.status === "active" ? new Date() : null,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
  }).returning();
  return created;
}

export async function upsertPremiumSubscription(input: PremiumUpsertInput): Promise<PremiumSubscription> {
  return upsertPremiumSubscriptionWithDb(db, input);
}

export async function listActiveLifetimePremiumGrants(): Promise<
  Array<{ userId: string; product: string; planKey: string }>
> {
  const now = new Date();
  return db
    .select({
      userId: premiumSubscriptions.userId,
      product: premiumSubscriptions.product,
      planKey: premiumSubscriptions.planKey,
    })
    .from(premiumSubscriptions)
    .where(and(
      eq(premiumSubscriptions.status, "active"),
      inArray(premiumSubscriptions.planKey, LIFETIME_PLAN_KEY_LIST),
      or(isNull(premiumSubscriptions.endsAt), gt(premiumSubscriptions.endsAt, now)),
    ));
}

export async function listPremiumEventsForUser(userId: string, limit = 50): Promise<PremiumEvent[]> {
  const cap = Math.min(Math.max(limit, 1), 200);
  return db
    .select()
    .from(premiumEvents)
    .where(eq(premiumEvents.userId, userId))
    .orderBy(desc(premiumEvents.createdAt))
    .limit(cap);
}

export async function grantAdminLifetimePremium(input: {
  targetUserId: string;
  product: "axtask" | "nodeweaver" | "bundle";
  grantedByUserId: string;
  grantType: "beta_tester" | "patron" | "manual";
  reason: string;
}): Promise<PremiumSubscription> {
  const actor = await getUserById(input.grantedByUserId);
  if (!actor || actor.role !== "admin") {
    throw new Error("Only administrators may grant lifetime premium");
  }
  const planKey = LIFETIME_PLAN_KEYS[input.product];
  const trimmedReason = input.reason.trim();
  if (trimmedReason.length < 3) {
    throw new Error("Reason is required (at least 3 characters)");
  }
  const metadata: Record<string, unknown> = {
    grantType: input.grantType,
    grantedBy: input.grantedByUserId,
    reason: trimmedReason,
    grantedAt: new Date().toISOString(),
    source: "admin_grant",
  };
  const { row, retired } = await db.transaction(async (tx) => {
    const now = new Date();
    const retirees = await tx
      .select()
      .from(premiumSubscriptions)
      .where(
        and(
          eq(premiumSubscriptions.userId, input.targetUserId),
          eq(premiumSubscriptions.product, input.product),
          notInArray(premiumSubscriptions.planKey, LIFETIME_PLAN_KEY_LIST),
          or(eq(premiumSubscriptions.status, "active"), eq(premiumSubscriptions.status, "grace")),
          or(isNull(premiumSubscriptions.endsAt), gt(premiumSubscriptions.endsAt, now)),
        ),
      );
    for (const sub of retirees) {
      let priorMeta: Record<string, unknown> = {};
      if (sub.metadataJson) {
        try {
          priorMeta = JSON.parse(sub.metadataJson) as Record<string, unknown>;
        } catch {
          priorMeta = {};
        }
      }
      await tx
        .update(premiumSubscriptions)
        .set({
          status: "inactive",
          updatedAt: now,
          endsAt: now,
          metadataJson: JSON.stringify({
            ...priorMeta,
            retiredForLifetimeAt: now.toISOString(),
            retiredForLifetimeBy: input.grantedByUserId,
            retiredForLifetimeReason: trimmedReason,
            grantType: input.grantType,
          }),
        })
        .where(eq(premiumSubscriptions.id, sub.id));
    }
    const row = await upsertPremiumSubscriptionWithDb(tx as DbLike, {
      userId: input.targetUserId,
      product: input.product,
      planKey,
      status: "active",
      graceUntil: null,
      endsAt: null,
      metadata,
    });
    return { row, retired: retirees };
  });
  for (const sub of retired) {
    await trackPremiumEvent({
      userId: input.targetUserId,
      eventName: "admin_subscription_retired_for_lifetime",
      product: sub.product,
      planKey: sub.planKey,
      metadata: {
        subscriptionId: sub.id,
        replacedByLifetimePlan: planKey,
        grantedBy: input.grantedByUserId,
        reason: trimmedReason,
      },
    });
  }
  await trackPremiumEvent({
    userId: input.targetUserId,
    eventName: "admin_lifetime_granted",
    product: input.product,
    planKey,
    metadata: {
      grantType: input.grantType,
      grantedBy: input.grantedByUserId,
      reason: trimmedReason,
      subscriptionId: row.id,
    },
  });
  return row;
}

export async function revokeAdminLifetimePremium(input: {
  targetUserId: string;
  product: "axtask" | "nodeweaver" | "bundle";
  revokedByUserId: string;
  reason: string;
}): Promise<PremiumSubscription | null> {
  const actor = await getUserById(input.revokedByUserId);
  if (!actor || actor.role !== "admin") {
    throw new Error("Only administrators may revoke lifetime premium");
  }
  const planKey = LIFETIME_PLAN_KEYS[input.product];
  const trimmedReason = input.reason.trim();
  if (trimmedReason.length < 3) {
    throw new Error("Reason is required (at least 3 characters)");
  }
  const [existing] = await db.select().from(premiumSubscriptions).where(and(
    eq(premiumSubscriptions.userId, input.targetUserId),
    eq(premiumSubscriptions.product, input.product),
    eq(premiumSubscriptions.planKey, planKey),
  ));
  if (!existing) return null;
  let priorMeta: Record<string, unknown> = {};
  if (existing.metadataJson) {
    try {
      priorMeta = JSON.parse(existing.metadataJson) as Record<string, unknown>;
    } catch {
      priorMeta = {};
    }
  }
  const [updated] = await db.update(premiumSubscriptions).set({
    status: "inactive",
    updatedAt: new Date(),
    metadataJson: JSON.stringify({
      ...priorMeta,
      revokedBy: input.revokedByUserId,
      revokedAt: new Date().toISOString(),
      revokeReason: trimmedReason,
    }),
  }).where(eq(premiumSubscriptions.id, existing.id)).returning();
  await trackPremiumEvent({
    userId: input.targetUserId,
    eventName: "admin_lifetime_revoked",
    product: input.product,
    planKey,
    metadata: {
      revokedBy: input.revokedByUserId,
      reason: trimmedReason,
      subscriptionId: existing.id,
    },
  });
  return updated;
}

export async function downgradePremiumToGrace(userId: string, product: "axtask" | "nodeweaver" | "bundle", days = 14): Promise<PremiumSubscription | null> {
  const [existing] = await db.select().from(premiumSubscriptions).where(and(
    eq(premiumSubscriptions.userId, userId),
    eq(premiumSubscriptions.product, product),
    notInArray(premiumSubscriptions.planKey, LIFETIME_PLAN_KEY_LIST),
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
    notInArray(premiumSubscriptions.planKey, LIFETIME_PLAN_KEY_LIST),
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

// ─── Collaboration helpers ──────────────────────────────────────────────────

const COLLABORATOR_ROLES = new Set(["viewer", "editor", "commenter"]);

export async function addCollaborator(
  taskId: string,
  userId: string,
  role: string,
  invitedBy: string
): Promise<TaskCollaborator> {
  if (!COLLABORATOR_ROLES.has(role)) {
    throw new Error("Invalid collaborator role");
  }
  const [collab] = await db
    .insert(taskCollaborators)
    .values({ id: randomUUID(), taskId, userId, role, invitedBy })
    .onConflictDoUpdate({
      target: [taskCollaborators.taskId, taskCollaborators.userId],
      set: { role, invitedBy },
    })
    .returning();
  return collab;
}

export async function removeCollaborator(taskId: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(taskCollaborators)
    .where(and(eq(taskCollaborators.taskId, taskId), eq(taskCollaborators.userId, userId)))
    .returning();
  return result.length > 0;
}

export async function getTaskCollaborators(taskId: string): Promise<(TaskCollaborator & { email: string; displayName: string | null })[]> {
  const rows = await db
    .select({
      id: taskCollaborators.id,
      taskId: taskCollaborators.taskId,
      userId: taskCollaborators.userId,
      role: taskCollaborators.role,
      invitedBy: taskCollaborators.invitedBy,
      invitedAt: taskCollaborators.invitedAt,
      email: users.email,
      displayName: users.displayName,
    })
    .from(taskCollaborators)
    .innerJoin(users, eq(taskCollaborators.userId, users.id))
    .where(eq(taskCollaborators.taskId, taskId));
  return rows;
}

export async function updateCollaboratorRole(taskId: string, userId: string, role: string): Promise<TaskCollaborator | null> {
  if (!COLLABORATOR_ROLES.has(role)) {
    throw new Error("Invalid collaborator role");
  }
  const [updated] = await db
    .update(taskCollaborators)
    .set({ role })
    .where(and(eq(taskCollaborators.taskId, taskId), eq(taskCollaborators.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function getSharedTasks(userId: string): Promise<Task[]> {
  const rows = await db
    .select({ taskId: taskCollaborators.taskId })
    .from(taskCollaborators)
    .where(eq(taskCollaborators.userId, userId));
  if (rows.length === 0) return [];
  const taskIds = rows.map(r => r.taskId);
  const result = await db.select().from(tasks).where(inArray(tasks.id, taskIds));
  return result;
}

export async function canAccessTask(userId: string, taskId: string): Promise<{ canAccess: boolean; role: string }> {
  const [task] = await db.select({ userId: tasks.userId }).from(tasks).where(eq(tasks.id, taskId));
  if (task?.userId === userId) return { canAccess: true, role: "owner" };
  const [collab] = await db
    .select({ role: taskCollaborators.role })
    .from(taskCollaborators)
    .where(and(eq(taskCollaborators.taskId, taskId), eq(taskCollaborators.userId, userId)));
  if (collab) return { canAccess: true, role: collab.role };
  return { canAccess: false, role: "" };
}

export async function isTaskOwner(userId: string, taskId: string): Promise<boolean> {
  const [task] = await db.select({ userId: tasks.userId }).from(tasks).where(eq(tasks.id, taskId));
  return task?.userId === userId;
}

export async function getTaskRowById(taskId: string): Promise<Task | undefined> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  return row;
}

export type CommunityTaskPublicDto = {
  id: string;
  activity: string;
  date: string;
  time: string | null;
  status: string;
  priority: string;
  classification: string;
  notes?: string;
};

export function toCommunityTaskPublicDto(task: Task): CommunityTaskPublicDto {
  const base: CommunityTaskPublicDto = {
    id: task.id,
    activity: task.activity,
    date: task.date,
    time: task.time ?? null,
    status: task.status,
    priority: task.priority,
    classification: task.classification,
  };
  if (task.communityShowNotes) {
    base.notes = task.notes || "";
  }
  return base;
}

export async function listPublicCommunityTasks(
  limit: number,
  cursor?: { publishedAt: Date; id: string; createdAt?: Date } | null,
): Promise<{
  items: Task[];
  nextCursor: { publishedAt: string; id: string; createdAt: string } | null;
}> {
  const cap = Math.min(Math.max(limit, 1), 50);
  const olderThanCursor = cursor
    ? cursor.createdAt != null
      ? or(
          lt(tasks.communityPublishedAt, cursor.publishedAt),
          and(
            eq(tasks.communityPublishedAt, cursor.publishedAt),
            or(
              lt(tasks.createdAt, cursor.createdAt),
              and(eq(tasks.createdAt, cursor.createdAt), sql`${tasks.id}::text < ${cursor.id}`),
            ),
          ),
        )
      : or(
          lt(tasks.communityPublishedAt, cursor.publishedAt),
          and(eq(tasks.communityPublishedAt, cursor.publishedAt), sql`${tasks.id}::text < ${cursor.id}`),
        )
    : undefined;

  const baseAnd = cursor
    ? and(eq(tasks.visibility, "community"), sql`${tasks.communityPublishedAt} IS NOT NULL`, olderThanCursor)
    : and(eq(tasks.visibility, "community"), sql`${tasks.communityPublishedAt} IS NOT NULL`);

  const rows = await db
    .select()
    .from(tasks)
    .where(baseAnd!)
    .orderBy(desc(tasks.communityPublishedAt), desc(tasks.createdAt), desc(tasks.id))
    .limit(cap + 1);

  const slice = rows.slice(0, cap);
  const last = slice.length > 0 ? slice[slice.length - 1]! : null;
  const next =
    rows.length > cap && last
      ? {
          publishedAt: (last.communityPublishedAt ?? new Date()).toISOString(),
          id: last.id,
          createdAt: (last.createdAt instanceof Date ? last.createdAt : new Date(last.createdAt ?? Date.now())).toISOString(),
        }
      : null;
  return { items: slice, nextCursor: next };
}

export async function getPublicCommunityTaskById(taskId: string): Promise<Task | undefined> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.visibility, "community")));
  return row;
}

export async function publishTaskToCommunity(
  ownerUserId: string,
  taskId: string,
  showNotes: boolean,
): Promise<Task | null> {
  const now = new Date();
  const [existing] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, ownerUserId)));
  if (!existing) return null;
  const [updated] = await db
    .update(tasks)
    .set({
      visibility: "community",
      communityPublishedAt: existing.communityPublishedAt ?? now,
      communityShowNotes: showNotes,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, ownerUserId)))
    .returning();
  return updated ?? null;
}

export async function unpublishTaskFromCommunity(ownerUserId: string, taskId: string): Promise<Task | null> {
  const now = new Date();
  const [updated] = await db
    .update(tasks)
    .set({
      visibility: "private",
      communityShowNotes: false,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, ownerUserId)))
    .returning();
  return updated ?? null;
}

export async function countTasksWhereUserIsCollaborator(userId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(taskCollaborators)
    .where(eq(taskCollaborators.userId, userId));
  return Number(row?.c) || 0;
}

export async function getDominantClassificationForUser(userId: string): Promise<string | null> {
  const rows = await db
    .select({ cl: tasks.classification, n: count() })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "completed")))
    .groupBy(tasks.classification)
    .orderBy(desc(count()));
  const top = rows[0];
  return top?.cl ?? null;
}

export async function tryGrantMilestone(
  userId: string,
  milestoneKey: string,
  coins: number,
  details: string,
): Promise<{ granted: boolean; balance?: number }> {
  return db.transaction(async (tx) => {
    const [exists] = await tx
      .select({ id: userMilestoneGrants.id })
      .from(userMilestoneGrants)
      .where(and(eq(userMilestoneGrants.userId, userId), eq(userMilestoneGrants.milestoneKey, milestoneKey)));
    if (exists) return { granted: false };
    const grantId = randomUUID();
    try {
      await tx.insert(userMilestoneGrants).values({
        id: grantId,
        userId,
        milestoneKey,
        coinsGranted: coins,
      });
    } catch (e) {
      if (isPgUniqueViolation(e)) return { granted: false };
      throw e;
    }
    const [existingWallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId));
    if (!existingWallet) {
      await tx.insert(wallets).values({ userId });
    }
    const [updated] = await tx
      .update(wallets)
      .set({
        balance: sql`${wallets.balance} + ${coins}`,
        lifetimeEarned: sql`${wallets.lifetimeEarned} + ${coins}`,
      })
      .where(eq(wallets.userId, userId))
      .returning();
    await tx.insert(coinTransactions).values({
      id: randomUUID(),
      userId,
      amount: coins,
      reason: "milestone",
      details,
    });
    return { granted: true, balance: updated?.balance };
  });
}

export async function processUserMilestoneGrants(userId: string): Promise<{ grants: string[] }> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return { grants: [] };
  const granted: string[] = [];
  const now = new Date();
  const todayMonth = now.getUTCMonth() + 1;
  const todayDay = now.getUTCDate();

  if (u.birthDate) {
    const bd = String(u.birthDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
      const parts = bd.split("-").map((p) => Number(p));
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        const [, m, d] = parts;
        if (
          typeof m === "number" &&
          typeof d === "number" &&
          m >= 1 &&
          m <= 12 &&
          d >= 1 &&
          d <= 31
        ) {
          const dt = new Date(Date.UTC(parts[0], m - 1, d));
          if (dt.getUTCFullYear() === parts[0] && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) {
            if (m === todayMonth && d === todayDay) {
              const key = `birthday_${now.getUTCFullYear()}`;
              const r = await tryGrantMilestone(userId, key, 50, "Birthday bonus");
              if (r.granted) granted.push(key);
            }
          }
        }
      }
    }
  }

  if (u.createdAt) {
    const c = new Date(u.createdAt);
    if (c.getUTCMonth() + 1 === todayMonth && c.getUTCDate() === todayDay) {
      const years = now.getUTCFullYear() - c.getUTCFullYear();
      if (years >= 1) {
        const key = `account_anniversary_${years}y_${now.getUTCFullYear()}`;
        const coins = 25 + Math.min(years, 10) * 5;
        const r = await tryGrantMilestone(userId, key, coins, `Account anniversary (${years}y)`);
        if (r.granted) granted.push(key);
      }
    }
  }

  return { grants: granted };
}

export async function getUserEntourageRow(userId: string): Promise<UserEntourage | undefined> {
  const [row] = await db.select().from(userEntourage).where(eq(userEntourage.userId, userId));
  return row;
}

export async function upsertUserEntourageRow(userId: string, payloadJson: string): Promise<void> {
  const now = new Date();
  await db
    .insert(userEntourage)
    .values({ userId, payloadJson, computedAt: now })
    .onConflictDoUpdate({
      target: userEntourage.userId,
      set: { payloadJson, computedAt: now },
    });
}

export async function getUserYoutubeProbeState(userId: string): Promise<UserYoutubeProbeState | undefined> {
  const [row] = await db.select().from(userYoutubeProbeState).where(eq(userYoutubeProbeState.userId, userId));
  return row;
}

export async function upsertUserYoutubeProbeState(
  userId: string,
  lastVideoId: string,
  lastOfferedAt: Date,
): Promise<void> {
  await db
    .insert(userYoutubeProbeState)
    .values({ userId, lastVideoId, lastOfferedAt, updatedAt: lastOfferedAt })
    .onConflictDoUpdate({
      target: userYoutubeProbeState.userId,
      set: { lastVideoId, lastOfferedAt, updatedAt: lastOfferedAt },
    });
}

export async function insertYoutubeProbeFeedback(opts: {
  userId: string;
  videoId: string;
  reaction: string;
  probeVersion: string;
  contextSnapshotJson: string | null;
}): Promise<YoutubeProbeFeedback> {
  const [row] = await db
    .insert(youtubeProbeFeedback)
    .values({
      userId: opts.userId,
      videoId: opts.videoId,
      reaction: opts.reaction,
      probeVersion: opts.probeVersion,
      contextSnapshotJson: opts.contextSnapshotJson,
    })
    .returning();
  if (!row) throw new Error("insertYoutubeProbeFeedback: no row returned");
  return row;
}

export async function changePremiumPlanForUser(
  userId: string,
  product: "axtask" | "nodeweaver" | "bundle",
  planKey: string,
): Promise<PremiumSubscription> {
  if (LIFETIME_PLAN_KEY_LIST.includes(planKey)) {
    throw new Error("Lifetime plans cannot be activated via change-plan");
  }
  if (!PREMIUM_FEATURE_MATRIX[planKey]) {
    throw new Error("Unknown plan key");
  }
  const productFromKey =
    planKey.startsWith("axtask_")
      ? "axtask"
      : planKey.startsWith("nodeweaver_")
        ? "nodeweaver"
        : planKey.startsWith("power_bundle")
          ? "bundle"
          : null;
  if (productFromKey !== product) {
    throw new Error("Plan key does not match product");
  }

  const row = await db.transaction(async (tx) => {
    await tx
      .update(premiumSubscriptions)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(
        and(
          eq(premiumSubscriptions.userId, userId),
          eq(premiumSubscriptions.product, product),
          notInArray(premiumSubscriptions.planKey, LIFETIME_PLAN_KEY_LIST),
        ),
      );

    return upsertPremiumSubscriptionWithDb(tx, {
      userId,
      product,
      planKey,
      status: "active",
      graceUntil: null,
      endsAt: null,
    });
  });
  await trackPremiumEvent({
    userId,
    eventName: "premium_plan_changed",
    product,
    planKey,
    metadata: { planKey },
  });
  return row;
}

export async function cancelPremiumSubscriptionForUser(
  userId: string,
  product: "axtask" | "nodeweaver" | "bundle",
): Promise<PremiumSubscription | null> {
  const [existing] = await db
    .select()
    .from(premiumSubscriptions)
    .where(
      and(
        eq(premiumSubscriptions.userId, userId),
        eq(premiumSubscriptions.product, product),
        notInArray(premiumSubscriptions.planKey, LIFETIME_PLAN_KEY_LIST),
        or(eq(premiumSubscriptions.status, "active"), eq(premiumSubscriptions.status, "grace")),
      ),
    )
    .orderBy(desc(premiumSubscriptions.updatedAt))
    .limit(1);
  if (!existing) return null;
  const end = new Date();
  const [updated] = await db
    .update(premiumSubscriptions)
    .set({
      status: "inactive",
      graceUntil: null,
      endsAt: end,
      updatedAt: end,
    })
    .where(eq(premiumSubscriptions.id, existing.id))
    .returning();
  await trackPremiumEvent({
    userId,
    eventName: "premium_subscription_cancelled",
    product,
    planKey: updated.planKey,
    metadata: { endsAt: end.toISOString() },
  });
  return updated;
}

export type AvatarCompanionInput = {
  slot: "mood" | "archetype" | "productivity" | "social" | "lazy";
  key: string;
  label: string;
};

function avatarLevelForTotalXp(totalXp: number): number {
  let level = 1;
  let needed = 100;
  let remaining = totalXp;
  while (remaining >= needed && level < 100) {
    remaining -= needed;
    level += 1;
    needed = 100 + (level - 1) * 25;
  }
  return level;
}

function missionTextForAvatar(profile: AvatarProfile): string {
  const archetype = profile.archetypeKey || "general";
  if (profile.avatarKey === "archetype") {
    return `Post a task or feedback related to "${archetype}" and complete it to level me up.`;
  }
  if (profile.avatarKey === "productivity") {
    return "Complete a task and mark it done to train your productivity companion.";
  }
  if (profile.avatarKey === "social") {
    return "Post constructive feedback or a social update to grow your social companion.";
  }
  if (profile.avatarKey === "lazy") {
    if (archetype === "triage_buddy") {
      return "Name the single next step you will do first, then jot one thing you are grateful is already true. Big lists shrink one breath at a time.";
    }
    if (archetype === "unplug_nudge") {
      return "Slide notification intensity down a notch when you can, then note one win worth savoring. Less ping, more presence.";
    }
    if (archetype === "slow_lane") {
      return "Your pace matches a softer inbox — stretch, enjoy what you have, and log a tiny gratitude line on a task or feedback.";
    }
    return "Talk through what to do first, a tough trade-off, or something you are thankful for. Rest and clarity are XP.";
  }
  return "Log a meaningful task or feedback update to improve your mood companion.";
}

export async function ensureAvatarProfilesFromEntourage(
  userId: string,
  companions: AvatarCompanionInput[],
): Promise<AvatarProfile[]> {
  for (const comp of companions) {
    const existing = await db
      .select()
      .from(avatarProfiles)
      .where(and(eq(avatarProfiles.userId, userId), eq(avatarProfiles.avatarKey, comp.slot)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(avatarProfiles).values({
        id: randomUUID(),
        userId,
        avatarKey: comp.slot,
        archetypeKey: comp.key,
        displayName: comp.label,
        level: 1,
        xp: 0,
        totalXp: 0,
      });
    } else {
      await db
        .update(avatarProfiles)
        .set({ archetypeKey: comp.key, displayName: comp.label, updatedAt: new Date() })
        .where(eq(avatarProfiles.id, existing[0].id));
    }
  }

  return db
    .select()
    .from(avatarProfiles)
    .where(eq(avatarProfiles.userId, userId))
    .orderBy(asc(avatarProfiles.avatarKey));
}

export async function getAvatarProfilesForUser(userId: string): Promise<Array<AvatarProfile & { mission: string }>> {
  const rows = await db
    .select()
    .from(avatarProfiles)
    .where(eq(avatarProfiles.userId, userId))
    .orderBy(asc(avatarProfiles.avatarKey));
  return rows.map((r) => ({ ...r, mission: missionTextForAvatar(r) }));
}

export async function awardAvatarXp(
  userId: string,
  avatarKey: string,
  sourceType: "task" | "feedback" | "post",
  sourceRef: string,
  xpAwarded: number,
  coinsAwarded: number,
  metadata?: Record<string, unknown>,
): Promise<{ awarded: boolean; profile?: AvatarProfile }> {
  try {
    return await db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(avatarProfiles)
        .where(and(eq(avatarProfiles.userId, userId), eq(avatarProfiles.avatarKey, avatarKey)))
        .limit(1);
      if (!profile) return { awarded: false };

      try {
        await tx.insert(avatarXpEvents).values({
          id: randomUUID(),
          userId,
          avatarKey,
          sourceType,
          sourceRef,
          xpAwarded,
          coinsAwarded,
          metadataJson: metadata ? JSON.stringify(metadata) : null,
        });
      } catch (e) {
        if (isPgUniqueViolation(e)) return { awarded: false };
        throw e;
      }

      const totalXp = profile.totalXp + xpAwarded;
      const level = avatarLevelForTotalXp(totalXp);
      const levelBaseXp = (() => {
        let spent = 0;
        for (let l = 1; l < level; l++) {
          spent += 100 + (l - 1) * 25;
        }
        return spent;
      })();
      const currentXp = Math.max(0, totalXp - levelBaseXp);

      const [row] = await tx
        .update(avatarProfiles)
        .set({
          totalXp,
          xp: currentXp,
          level,
          updatedAt: new Date(),
        })
        .where(eq(avatarProfiles.id, profile.id))
        .returning();

      if (coinsAwarded > 0) {
        const [w0] = await tx.select().from(wallets).where(eq(wallets.userId, userId));
        if (!w0) await tx.insert(wallets).values({ userId });
        await tx
          .update(wallets)
          .set({
            balance: sql`${wallets.balance} + ${coinsAwarded}`,
            lifetimeEarned: sql`${wallets.lifetimeEarned} + ${coinsAwarded}`,
          })
          .where(eq(wallets.userId, userId));
        await tx.insert(coinTransactions).values({
          id: randomUUID(),
          userId,
          amount: coinsAwarded,
          reason: `avatar_xp:${avatarKey}`,
          details: `Avatar XP from ${sourceType}:${sourceRef}`,
        });
      }

      return { awarded: true, profile: row ?? profile };
    });
  } catch (e) {
    if (isPgUniqueViolation(e)) return { awarded: false };
    throw e;
  }
}

export async function awardAvatarProgressFromContent(
  userId: string,
  sourceType: "task" | "feedback" | "post",
  sourceRef: string,
  text: string,
  completed = false,
): Promise<Array<{ avatarKey: string; xp: number; coins: number }>> {
  const profiles = await db
    .select()
    .from(avatarProfiles)
    .where(eq(avatarProfiles.userId, userId));
  const normalized = normalizeText(text || "");
  const rewards: Array<{ avatarKey: string; xp: number; coins: number }> = [];
  const notifPref = await getUserNotificationPreference(userId);
  const notificationIntensity = notifPref.intensity ?? 50;

  const computeXp = (p: AvatarProfile): number => {
    if (p.avatarKey === "archetype") {
      const keyNorm = normalizeText(p.archetypeKey.replace(/_/g, " "));
      return normalized.includes(keyNorm) ? 35 : 0;
    }
    if (p.avatarKey === "productivity") {
      if (sourceType === "task") return completed ? 40 : 15;
      return 0;
    }
    if (p.avatarKey === "social") {
      return sourceType === "feedback" || sourceType === "post" ? 30 : 0;
    }
    if (p.avatarKey === "mood") {
      return sourceType === "task" || sourceType === "feedback" ? 12 : 0;
    }
    if (p.avatarKey === "lazy") {
      return computeLazyAvatarXp({
        sourceType,
        completed,
        text,
        notificationIntensity,
      });
    }
    return 0;
  };

  for (const p of profiles) {
    const xp = computeXp(p);
    if (xp <= 0) continue;
    const coins = Math.max(1, Math.round(xp / 5));
    const result = await awardAvatarXp(userId, p.avatarKey, sourceType, sourceRef, xp, coins, {
      completed,
      archetype: p.archetypeKey,
      notificationIntensity,
    });
    if (result.awarded) {
      rewards.push({ avatarKey: p.avatarKey, xp, coins });
    }
  }
  return rewards;
}

export async function engageAvatarWithContent(
  userId: string,
  avatarKey: string,
  sourceType: "task" | "feedback" | "post",
  sourceRef: string,
  text: string,
  completed = false,
): Promise<{ awarded: boolean; xp: number; coins: number; profile?: AvatarProfile }> {
  const [profile] = await db
    .select()
    .from(avatarProfiles)
    .where(and(eq(avatarProfiles.userId, userId), eq(avatarProfiles.avatarKey, avatarKey)))
    .limit(1);
  if (!profile) return { awarded: false, xp: 0, coins: 0 };

  const normalized = normalizeText(text || "");
  const notifPref = await getUserNotificationPreference(userId);
  const notificationIntensity = notifPref.intensity ?? 50;
  let xp = 0;
  if (profile.avatarKey === "archetype") {
    const keyNorm = normalizeText(profile.archetypeKey.replace(/_/g, " "));
    xp = normalized.includes(keyNorm) ? 35 : 0;
  } else if (profile.avatarKey === "productivity") {
    xp = sourceType === "task" ? (completed ? 40 : 15) : 0;
  } else if (profile.avatarKey === "social") {
    xp = sourceType === "feedback" || sourceType === "post" ? 30 : 0;
  } else if (profile.avatarKey === "mood") {
    xp = sourceType === "task" || sourceType === "feedback" ? 12 : 0;
  } else if (profile.avatarKey === "lazy") {
    xp = computeLazyAvatarXp({
      sourceType,
      completed,
      text,
      notificationIntensity,
    });
  }
  if (xp <= 0) return { awarded: false, xp: 0, coins: 0, profile };

  const coins = Math.max(1, Math.round(xp / 5));
  const result = await awardAvatarXp(userId, avatarKey, sourceType, sourceRef, xp, coins, {
    completed,
    archetype: profile.archetypeKey,
    notificationIntensity,
  });
  return { awarded: !!result.awarded, xp, coins, profile: result.profile ?? profile };
}

export async function spendCoinsForAvatarBoost(
  userId: string,
  avatarKey: string,
  coins: number,
): Promise<{ ok: boolean; profile?: AvatarProfile; message?: string }> {
  if (!Number.isFinite(coins) || coins <= 0) {
    return { ok: false, message: "Invalid coin amount" };
  }
  try {
    return await db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(avatarProfiles)
        .where(and(eq(avatarProfiles.userId, userId), eq(avatarProfiles.avatarKey, avatarKey)))
        .limit(1);
      if (!profile) return { ok: false, message: "Avatar not found" };

      const [existingWallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId));
      if (!existingWallet) {
        await tx.insert(wallets).values({ userId });
      }
      const [spentWallet] = await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} - ${coins}` })
        .where(and(eq(wallets.userId, userId), sql`${wallets.balance} >= ${coins}`))
        .returning();
      if (!spentWallet) return { ok: false, message: "Not enough coins" };

      await tx.insert(coinTransactions).values({
        id: randomUUID(),
        userId,
        amount: -coins,
        reason: `avatar_boost:${avatarKey}`,
      });

      const xpBoost = coins * 2;
      const sourceRef = `coin_boost_${Date.now()}`;
      await tx.insert(avatarXpEvents).values({
        id: randomUUID(),
        userId,
        avatarKey,
        sourceType: "post",
        sourceRef,
        xpAwarded: xpBoost,
        coinsAwarded: 0,
        metadataJson: JSON.stringify({ boostedByCoins: coins }),
      });

      const totalXp = profile.totalXp + xpBoost;
      const level = avatarLevelForTotalXp(totalXp);
      const levelBaseXp = (() => {
        let spent = 0;
        for (let l = 1; l < level; l++) {
          spent += 100 + (l - 1) * 25;
        }
        return spent;
      })();
      const currentXp = Math.max(0, totalXp - levelBaseXp);

      const [updated] = await tx
        .update(avatarProfiles)
        .set({
          totalXp,
          xp: currentXp,
          level,
          updatedAt: new Date(),
        })
        .where(eq(avatarProfiles.id, profile.id))
        .returning();

      return { ok: true, profile: updated ?? profile };
    });
  } catch (e) {
    if (isPgUniqueViolation(e)) {
      return { ok: false, message: "Could not apply boost" };
    }
    throw e;
  }
}

// ─── Pattern Learning Storage ────────────────────────────────────────────────

export type TaskPatternRebuildRow = {
  patternType: string;
  patternKey: string;
  data: unknown;
  confidence: number;
  occurrences: number;
};

/** Replace all learned patterns for a user in one transaction (full rebuild). */
export async function replaceUserTaskPatterns(
  userId: string,
  rows: TaskPatternRebuildRow[],
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(taskPatterns).where(eq(taskPatterns.userId, userId));
    const CHUNK = 150;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      if (slice.length === 0) continue;
      await tx.insert(taskPatterns).values(
        slice.map((r) => ({
          id: randomUUID(),
          userId,
          patternType: r.patternType,
          patternKey: r.patternKey,
          data: JSON.stringify(r.data),
          confidence: r.confidence,
          occurrences: Math.max(1, Math.floor(Number(r.occurrences)) || 1),
          lastSeen: now,
          createdAt: now,
        })),
      );
    }
  });
}

export async function upsertPattern(
  userId: string,
  patternType: string,
  patternKey: string,
  data: unknown,
  confidence: number,
  occurrences: number = 1,
): Promise<TaskPattern> {
  const now = new Date();
  const dataStr = JSON.stringify(data);
  const id = randomUUID();
  const occ = Math.max(1, Math.floor(Number(occurrences)) || 1);
  const [row] = await db
    .insert(taskPatterns)
    .values({
      id,
      userId,
      patternType,
      patternKey,
      data: dataStr,
      confidence,
      occurrences: occ,
      lastSeen: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [taskPatterns.userId, taskPatterns.patternType, taskPatterns.patternKey],
      set: {
        data: dataStr,
        confidence,
        occurrences: occ,
        lastSeen: now,
      },
    })
    .returning();
  if (!row) throw new Error("upsertPattern failed");
  return row;
}

export async function getPatterns(userId: string): Promise<TaskPattern[]> {
  return db
    .select()
    .from(taskPatterns)
    .where(eq(taskPatterns.userId, userId))
    .orderBy(desc(taskPatterns.occurrences));
}

export async function getPatternsByType(userId: string, patternType: string): Promise<TaskPattern[]> {
  return db
    .select()
    .from(taskPatterns)
    .where(and(eq(taskPatterns.userId, userId), eq(taskPatterns.patternType, patternType)))
    .orderBy(desc(taskPatterns.occurrences));
}

export async function deleteStalePatterns(userId: string, olderThanDays: number = 90): Promise<number> {
  if (!Number.isFinite(olderThanDays) || olderThanDays <= 0) {
    throw new TypeError("deleteStalePatterns: olderThanDays must be a finite number > 0");
  }
  const days = Math.floor(olderThanDays);
  if (days < 1) {
    throw new TypeError("deleteStalePatterns: olderThanDays must be at least 1 day after flooring");
  }
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(taskPatterns)
    .where(and(eq(taskPatterns.userId, userId), lt(taskPatterns.lastSeen, cutoff)))
    .returning();
  return result.length;
}

export async function clearPatterns(userId: string): Promise<void> {
  await db.delete(taskPatterns).where(eq(taskPatterns.userId, userId));
}

// ─── User classification categories ────────────────────────────────────────

const MAX_USER_CLASSIFICATION_CATEGORIES = 40;

export async function listUserClassificationCategories(userId: string): Promise<UserClassificationCategory[]> {
  return db
    .select()
    .from(userClassificationCategories)
    .where(eq(userClassificationCategories.userId, userId))
    .orderBy(asc(userClassificationCategories.name));
}

export async function getCustomClassificationCoinReward(userId: string, label: string): Promise<number | null> {
  const norm = normalizeCategoryName(label);
  if (norm.length === 0) return null;
  const [row] = await db
    .select({ coinReward: userClassificationCategories.coinReward })
    .from(userClassificationCategories)
    .where(
      and(
        eq(userClassificationCategories.userId, userId),
        sql`lower(${userClassificationCategories.name}) = lower(${norm})`,
      ),
    )
    .limit(1);
  return row ? row.coinReward : null;
}

export async function createUserClassificationCategory(
  userId: string,
  input: { name: string; coinReward?: number },
): Promise<{ ok: true; row: UserClassificationCategory } | { ok: false; message: string }> {
  const name = formatCategoryNameForStorage(input.name);
  if (name.length < 2 || name.length > 48) {
    return { ok: false, message: "Category name must be between 2 and 48 characters." };
  }
  if (isBuiltInClassification(name)) {
    return { ok: false, message: "That label is reserved for a built-in category." };
  }
  const coinReward = Math.min(20, Math.max(1, input.coinReward ?? 5));
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);

      const [dup] = await tx
        .select({ id: userClassificationCategories.id })
        .from(userClassificationCategories)
        .where(
          and(
            eq(userClassificationCategories.userId, userId),
            sql`lower(${userClassificationCategories.name}) = lower(${name})`,
          ),
        )
        .limit(1);
      if (dup) {
        return { ok: false, message: "You already have a category with this name." };
      }
      const [cnt] = await tx
        .select({ n: count() })
        .from(userClassificationCategories)
        .where(eq(userClassificationCategories.userId, userId));
      if (Number(cnt?.n) >= MAX_USER_CLASSIFICATION_CATEGORIES) {
        return { ok: false, message: "Maximum custom categories reached." };
      }

      try {
        const [row] = await tx
          .insert(userClassificationCategories)
          .values({ id: randomUUID(), userId, name, coinReward })
          .returning();
        return { ok: true, row };
      } catch (e) {
        if (isPgUniqueViolation(e)) {
          return { ok: false, message: "You already have a category with this name." };
        }
        throw e;
      }
    });
  } catch (e) {
    if (isPgUniqueViolation(e)) {
      return { ok: false, message: "You already have a category with this name." };
    }
    throw e;
  }
}

// ─── Classification Contributions ──────────────────────────────────────────

export async function createClassificationContribution(
  taskId: string,
  userId: string,
  classification: string,
  baseCoinsAwarded: number
): Promise<{ contribution: ClassificationContribution; created: boolean }> {
  try {
    const [contrib] = await db
      .insert(classificationContributions)
      .values({
        id: randomUUID(),
        taskId,
        userId,
        classification,
        baseCoinsAwarded,
        totalCoinsEarned: baseCoinsAwarded,
        confirmationCount: 0,
      })
      .returning();
    return { contribution: contrib, created: true };
  } catch (e) {
    if (isPgUniqueViolation(e)) {
      const existing = await getContribution(taskId, userId);
      if (existing) return { contribution: existing, created: false };
    }
    throw e;
  }
}

export async function getContributionsForTask(taskId: string): Promise<(ClassificationContribution & { displayName: string | null })[]> {
  const rows = await db
    .select({
      id: classificationContributions.id,
      taskId: classificationContributions.taskId,
      userId: classificationContributions.userId,
      classification: classificationContributions.classification,
      baseCoinsAwarded: classificationContributions.baseCoinsAwarded,
      totalCoinsEarned: classificationContributions.totalCoinsEarned,
      confirmationCount: classificationContributions.confirmationCount,
      createdAt: classificationContributions.createdAt,
      displayName: users.displayName,
    })
    .from(classificationContributions)
    .innerJoin(users, eq(users.id, classificationContributions.userId))
    .where(eq(classificationContributions.taskId, taskId))
    .orderBy(desc(classificationContributions.createdAt));
  return rows;
}

export async function getContribution(taskId: string, userId: string): Promise<ClassificationContribution | null> {
  const [row] = await db
    .select()
    .from(classificationContributions)
    .where(and(
      eq(classificationContributions.taskId, taskId),
      eq(classificationContributions.userId, userId)
    ))
    .limit(1);
  return row || null;
}

const CONFIRMER_CONFIRMATION_COINS = 3;

async function addCoinsInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  amount: number,
  reason: string,
  details?: string,
  taskId?: string,
): Promise<void> {
  const [row] = await tx.select().from(wallets).where(eq(wallets.userId, userId));
  if (!row) {
    await tx.insert(wallets).values({ userId });
  }
  await tx
    .update(wallets)
    .set({
      balance: sql`${wallets.balance} + ${amount}`,
      lifetimeEarned: sql`${wallets.lifetimeEarned} + ${amount}`,
    })
    .where(eq(wallets.userId, userId));
  await tx.insert(coinTransactions).values({
    id: randomUUID(),
    userId,
    amount,
    reason,
    details,
    taskId,
  });
}

/** Single transaction: classification contribution row + wallet credit (no orphan contributions). */
export async function awardCoinsForClassificationAtomic(
  userId: string,
  taskId: string,
  classification: string,
  baseCoins: number,
  details: string,
): Promise<{ coinsEarned: number; newBalance: number; classification: string } | null> {
  return db.transaction(async (tx) => {
    try {
      await tx.insert(classificationContributions).values({
        id: randomUUID(),
        taskId,
        userId,
        classification,
        baseCoinsAwarded: baseCoins,
        totalCoinsEarned: baseCoins,
        confirmationCount: 0,
      });
    } catch (e) {
      if (isPgUniqueViolation(e)) return null;
      throw e;
    }

    await addCoinsInTx(tx, userId, baseCoins, "classification", details, taskId);

    const [walletRow] = await tx.select().from(wallets).where(eq(wallets.userId, userId));
    return {
      coinsEarned: baseCoins,
      newBalance: walletRow?.balance ?? 0,
      classification,
    };
  });
}

export async function awardCoinsForConfirmationAtomic(
  confirmingUserId: string,
  taskId: string,
): Promise<{
  confirmerCoins: number;
  contributorBonuses: { userId: string; displayName: string | null; bonus: number }[];
  totalConfirmations: number;
  newBalance: number;
} | null> {
  const alreadyConfirmed = await hasUserConfirmedTask(taskId, confirmingUserId);
  if (alreadyConfirmed) return null;
  const contributions = await getContributionsForTask(taskId);
  if (contributions.length === 0) return null;
  if (contributions.some((c) => c.userId === confirmingUserId)) return null;

  const primaryContribution = contributions[0];

  return db.transaction(async (tx) => {
    const confirmId = randomUUID();
    const [insertedRow] = await tx
      .insert(classificationConfirmations)
      .values({
        id: confirmId,
        contributionId: primaryContribution.id,
        taskId,
        userId: confirmingUserId,
        coinsAwarded: CONFIRMER_CONFIRMATION_COINS,
      })
      .onConflictDoNothing({
        target: [classificationConfirmations.taskId, classificationConfirmations.userId],
      })
      .returning();
    if (!insertedRow) return null;

    await addCoinsInTx(
      tx,
      confirmingUserId,
      CONFIRMER_CONFIRMATION_COINS,
      "classification_confirm",
      "Confirmed classification on task",
      taskId,
    );

    const [primaryLocked] = await tx
      .select({
        id: classificationContributions.id,
        userId: classificationContributions.userId,
        baseCoinsAwarded: classificationContributions.baseCoinsAwarded,
        confirmationCount: classificationContributions.confirmationCount,
        displayName: users.displayName,
      })
      .from(classificationContributions)
      .innerJoin(users, eq(users.id, classificationContributions.userId))
      .where(eq(classificationContributions.id, primaryContribution.id))
      .for("update");

    const contributorBonuses: { userId: string; displayName: string | null; bonus: number }[] = [];

    if (primaryLocked) {
      const bonus = computeCompoundContributorBonus(
        primaryLocked.baseCoinsAwarded,
        primaryLocked.confirmationCount,
      );
      const compoundPeriod = Math.min(primaryLocked.confirmationCount + 1, getMaxCompoundPeriods());
      await tx
        .update(classificationContributions)
        .set(
          bonus > 0
            ? {
                confirmationCount: sql`${classificationContributions.confirmationCount} + 1`,
                totalCoinsEarned: sql`${classificationContributions.totalCoinsEarned} + ${bonus}`,
              }
            : {
                confirmationCount: sql`${classificationContributions.confirmationCount} + 1`,
              },
        )
        .where(eq(classificationContributions.id, primaryContribution.id));
      if (bonus > 0) {
        await addCoinsInTx(
          tx,
          primaryLocked.userId,
          bonus,
          "classification_confirmed",
          `Your classification was confirmed (×${compoundPeriod}): +${bonus} compound interest`,
          taskId,
        );
        contributorBonuses.push({
          userId: primaryLocked.userId,
          displayName: primaryLocked.displayName,
          bonus,
        });
      }
    }

    const [trow] = await tx
      .select({ c: count() })
      .from(classificationConfirmations)
      .where(eq(classificationConfirmations.taskId, taskId));
    const totalConfirmations = Number(trow?.c) || 0;

    const [confWallet] = await tx.select().from(wallets).where(eq(wallets.userId, confirmingUserId));

    return {
      confirmerCoins: CONFIRMER_CONFIRMATION_COINS,
      contributorBonuses,
      totalConfirmations,
      newBalance: confWallet?.balance ?? 0,
    };
  });
}

export async function hasUserConfirmedTask(taskId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(classificationConfirmations)
    .where(and(
      eq(classificationConfirmations.taskId, taskId),
      eq(classificationConfirmations.userId, userId)
    ));
  return (Number(row?.value) || 0) > 0;
}

export async function recordConfirmation(
  contributionId: string,
  taskId: string,
  confirmingUserId: string,
  coinsAwarded: number
): Promise<{ confirmation: ClassificationConfirmation; inserted: boolean }> {
  const id = randomUUID();
  const [insertedRow] = await db
    .insert(classificationConfirmations)
    .values({
      id,
      contributionId,
      taskId,
      userId: confirmingUserId,
      coinsAwarded,
    })
    .onConflictDoNothing({
      target: [classificationConfirmations.taskId, classificationConfirmations.userId],
    })
    .returning();

  if (insertedRow) {
    return { confirmation: insertedRow, inserted: true };
  }

  const [existing] = await db
    .select()
    .from(classificationConfirmations)
    .where(and(
      eq(classificationConfirmations.taskId, taskId),
      eq(classificationConfirmations.userId, confirmingUserId),
    ))
    .limit(1);

  if (!existing) {
    throw new Error("recordConfirmation: expected row after unique conflict");
  }
  return { confirmation: existing, inserted: false };
}

export async function incrementContributionConfirmCount(contributionId: string): Promise<void> {
  await db
    .update(classificationContributions)
    .set({
      confirmationCount: sql`${classificationContributions.confirmationCount} + 1`,
    })
    .where(eq(classificationContributions.id, contributionId));
}

export async function updateContributionEarnings(contributionId: string, additionalCoins: number): Promise<void> {
  await db
    .update(classificationContributions)
    .set({
      totalCoinsEarned: sql`${classificationContributions.totalCoinsEarned} + ${additionalCoins}`,
    })
    .where(eq(classificationContributions.id, contributionId));
}

export async function getUserClassificationStats(
  userId: string,
  since?: Date,
): Promise<{
  totalClassifications: number;
  totalConfirmationsReceived: number;
  totalClassificationCoins: number;
}> {
  const conds = [eq(classificationContributions.userId, userId)];
  if (since) {
    conds.push(gte(classificationContributions.createdAt, since));
  }
  const [classRow] = await db
    .select({
      total: count(),
      totalCoins: sql<number>`COALESCE(SUM(${classificationContributions.totalCoinsEarned}), 0)`,
      totalConfirmations: sql<number>`COALESCE(SUM(${classificationContributions.confirmationCount}), 0)`,
    })
    .from(classificationContributions)
    .where(and(...conds));

  return {
    totalClassifications: Number(classRow?.total) || 0,
    totalConfirmationsReceived: Number(classRow?.totalConfirmations) || 0,
    totalClassificationCoins: Number(classRow?.totalCoins) || 0,
  };
}