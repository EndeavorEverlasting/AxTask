import {
  tasks,
  users,
  passwordResetTokens,
  securityLogs,
  securityEvents,
  securityAlerts,
  wallets,
  coinTransactions,
  userBadges,
  rewardsCatalog,
  userRewards,
  taskCollaborators,
  taskPatterns,
  classificationContributions,
  classificationConfirmations,
  classificationDisputes,
  classificationDisputeVotes,
  categoryReviewTriggers,
  offlineGenerators,
  offlineSkillNodes,
  userOfflineSkills,
  avatarSkillNodes,
  userAvatarSkills,
  userAvatarProfiles,
  usageSnapshots,
  storagePolicies,
  attachmentAssets,
  messageAttachments,
  MESSAGE_ATTACHMENT_OWNER_TYPES,
  type MessageAttachmentOwnerType,
  taskImportFingerprints,
  invoices,
  invoiceEvents,
  mfaChallenges,
  billingPaymentMethods,
  idempotencyKeys,
  premiumSubscriptions,
  premiumSavedViews,
  premiumReviewWorkflows,
  premiumInsights,
  premiumEvents,
  userNotificationPreferences,
  userVoicePreferences,
  userCalendarPreferences,
  userPushSubscriptions,
  userAdherenceState,
  userAdherenceInterventions,
  studyDecks,
  studyCards,
  studySessions,
  studyReviewEvents,
  communityPosts,
  communityReplies,
  archetypePolls,
  archetypePollOptions,
  archetypePollVotes,
  taskClassificationThumbs,
  userAlarmSnapshots,
  collaborationInboxMessages,
  userLocationPlaces,
  userClassificationLabels,
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
  type ClassificationDispute,
  type ClassificationDisputeVote,
  type CategoryReviewTrigger,
  type CategoryReviewStatus,
  type OfflineGenerator,
  type OfflineSkillNode,
  type UserOfflineSkill,
  type AvatarSkillNode,
  type UserAvatarSkill,
  type UserAvatarProfile,
  type UsageSnapshot,
  type StoragePolicy,
  type AttachmentAsset,
  type Invoice,
  type InvoiceEvent,
  type BillingPaymentMethod,
  type PremiumSubscription,
  type PremiumSavedView,
  type PremiumReviewWorkflow,
  type PremiumInsight,
  type PremiumEvent,
  type UserNotificationPreference,
  type UserVoicePreference,
  type UserCalendarPreference,
  type VoiceListeningMode,
  type UserPushSubscription,
  type UserAdherenceState,
  type UserAdherenceIntervention,
  type AdherenceSignal,
  type StudyDeck,
  type StudyCard,
  type StudySession,
  type StudyReviewEvent,
  type CreateStudyDeckInput,
  type CreateStudyCardInput,
  type StartStudySessionInput,
  type SubmitStudyAnswerInput,
  type CommunityPost,
  type CommunityReply,
  type ArchetypePoll,
  type ArchetypePollOption,
  type ArchetypePollVote,
  type UserAlarmSnapshot,
  type CollaborationInboxMessage,
  type UserLocationPlace,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ne, ilike, or, asc, lt, lte, gt, gte, count, avg, sql, desc, inArray } from "drizzle-orm";
import type { ArchetypeKey } from "@shared/avatar-archetypes";
import { dominantArchetypeFromAvatarProfiles } from "./lib/poll-archetype";
import { applyKAnonymityToPollTallies, type RawOptionTally } from "./lib/archetype-poll-aggregate";
import { randomUUID, randomBytes, createHash } from "crypto";
import bcrypt from "bcrypt";
import { buildSecurityEventHash } from "./security/event-hash";
import { parseFeedbackPayload, parseFeedbackReviewPayload } from "./services/feedback-inbox-parser";
import { maskE164ForDisplay } from "@shared/phone";
import { displayAveragePriorityScoreFromDb } from "@shared/display-priority-score";
import { TASK_SEARCH_RESULT_LIMIT } from "@shared/task-list-limits";
import { getNotificationDispatchProfile, shouldDispatchByIntensity, type NotificationDispatchProfile } from "./services/notification-intensity";

// ─── User helpers ────────────────────────────────────────────────────────────

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
    totpSecretCiphertext,
    totpEnabledAt,
    birthDate: _birthDate,
    ...rest
  } = user;
  return {
    ...rest,
    phoneMasked: maskE164ForDisplay(phoneE164),
    phoneVerified: !!user.phoneVerifiedAt,
    totpEnabled: Boolean(totpEnabledAt && totpSecretCiphertext),
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

export async function getUserByPublicHandle(handle: string): Promise<User | undefined> {
  const normalized = handle.trim().toLowerCase().replace(/^@+/, "");
  if (!normalized) return undefined;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.publicHandle, normalized));
  return user || undefined;
}

export async function getInvitePreviewByPublicHandle(
  handle: string,
): Promise<Pick<User, "publicHandle" | "displayName" | "profileImageUrl"> | null> {
  const normalized = handle.trim().toLowerCase().replace(/^@+/, "");
  if (!normalized) return null;
  const [user] = await db
    .select({
      publicHandle: users.publicHandle,
      displayName: users.displayName,
      profileImageUrl: users.profileImageUrl,
    })
    .from(users)
    .where(eq(users.publicHandle, normalized));
  return user ?? null;
}

const HANDLE_PREFIX_SEARCH_MAX = 32;
const HANDLE_SUGGESTIONS_CAP = 5;

/** Prefix match on `public_handle` for invite autocomplete (privacy-safe columns only). */
export async function searchPublicInvitePreviewsByPrefix(
  prefix: string,
  limit = HANDLE_SUGGESTIONS_CAP,
): Promise<Pick<User, "publicHandle" | "displayName" | "profileImageUrl">[]> {
  const normalized = prefix.trim().toLowerCase().replace(/^@+/, "");
  if (normalized.length < 2) return [];
  const capped = normalized.slice(0, HANDLE_PREFIX_SEARCH_MAX);
  const cap = Math.min(Math.max(1, limit), 10);
  return await db
    .select({
      publicHandle: users.publicHandle,
      displayName: users.displayName,
      profileImageUrl: users.profileImageUrl,
    })
    .from(users)
    .where(ilike(users.publicHandle, `${capped}%`))
    .orderBy(asc(users.publicHandle))
    .limit(cap);
}

const RECENT_INVITE_COLLAB_FETCH = 64;

/** Distinct users this account has invited recently (by latest `invited_at`), safe preview fields only. */
export async function getRecentInviteCollaboratorPreviews(
  inviterUserId: string,
  limit = 8,
): Promise<Pick<User, "publicHandle" | "displayName" | "profileImageUrl">[]> {
  const rows = await db
    .select({
      userId: taskCollaborators.userId,
      publicHandle: users.publicHandle,
      displayName: users.displayName,
      profileImageUrl: users.profileImageUrl,
      invitedAt: taskCollaborators.invitedAt,
    })
    .from(taskCollaborators)
    .innerJoin(users, eq(taskCollaborators.userId, users.id))
    .where(
      and(
        eq(taskCollaborators.invitedBy, inviterUserId),
        ne(taskCollaborators.userId, inviterUserId),
      ),
    )
    .orderBy(desc(taskCollaborators.invitedAt))
    .limit(RECENT_INVITE_COLLAB_FETCH);

  const seen = new Set<string>();
  const out: Pick<User, "publicHandle" | "displayName" | "profileImageUrl">[] = [];
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    out.push({
      publicHandle: r.publicHandle,
      displayName: r.displayName,
      profileImageUrl: r.profileImageUrl,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function getUserById(id: string): Promise<SafeUser | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ? toSafeUser(user) : undefined;
}

/** Full row for server-only auth (TOTP ciphertext, etc.). */
export async function getUserRowById(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || undefined;
}

export async function updateUserAccountProfile(
  userId: string,
  input: { displayName: string | null; birthDate: string | null },
): Promise<void> {
  await db
    .update(users)
    .set({
      displayName: input.displayName,
      birthDate: input.birthDate,
    })
    .where(eq(users.id, userId));
}

export async function setUserTotpSecret(userId: string, ciphertext: string, enabledAt: Date): Promise<void> {
  await db
    .update(users)
    .set({
      totpSecretCiphertext: ciphertext,
      totpEnabledAt: enabledAt,
    })
    .where(eq(users.id, userId));
}

export async function clearUserTotp(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      totpSecretCiphertext: null,
      totpEnabledAt: null,
    })
    .where(eq(users.id, userId));
}

const DEFAULT_NOTIFICATION_INTENSITY = 50;

function clampNotificationIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const FEEDBACK_AVATAR_KEYS_SET = new Set([
  "archetype",
  "productivity",
  "mood",
  "social",
  "lazy",
]);

type FeedbackNudgePrefsShape = {
  master: number;
  byAvatar: Partial<Record<string, number>>;
};

function sanitizeFeedbackNudgePrefs(
  raw: unknown,
): FeedbackNudgePrefsShape {
  const fallback: FeedbackNudgePrefsShape = { master: 50, byAvatar: {} };
  if (!raw || typeof raw !== "object") return fallback;
  const input = raw as Record<string, unknown>;
  const master =
    typeof input.master === "number" && Number.isFinite(input.master)
      ? clampNotificationIntensity(input.master)
      : 50;
  const byAvatarIn =
    input.byAvatar && typeof input.byAvatar === "object"
      ? (input.byAvatar as Record<string, unknown>)
      : {};
  const byAvatar: Partial<Record<string, number>> = {};
  for (const [k, v] of Object.entries(byAvatarIn)) {
    if (!FEEDBACK_AVATAR_KEYS_SET.has(k)) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    byAvatar[k] = clampNotificationIntensity(v);
  }
  return { master, byAvatar };
}

function mergeFeedbackNudgePrefs(
  existing: FeedbackNudgePrefsShape,
  patch: unknown,
): FeedbackNudgePrefsShape {
  if (!patch || typeof patch !== "object") return existing;
  const patchObj = patch as Record<string, unknown>;
  const nextMaster =
    typeof patchObj.master === "number" && Number.isFinite(patchObj.master)
      ? clampNotificationIntensity(patchObj.master)
      : existing.master;
  const byAvatar: Partial<Record<string, number>> = { ...existing.byAvatar };
  if (patchObj.byAvatar && typeof patchObj.byAvatar === "object") {
    for (const [k, v] of Object.entries(patchObj.byAvatar as Record<string, unknown>)) {
      if (!FEEDBACK_AVATAR_KEYS_SET.has(k)) continue;
      if (v === null || v === undefined) {
        delete byAvatar[k];
        continue;
      }
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      byAvatar[k] = clampNotificationIntensity(v);
    }
  }
  return { master: nextMaster, byAvatar };
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
    groceryReminderEnabled: row?.groceryReminderEnabled ?? true,
    groceryAutoCreateTaskEnabled: row?.groceryAutoCreateTaskEnabled ?? false,
    groceryAutoNotifyEnabled: row?.groceryAutoNotifyEnabled ?? false,
    quietHoursStart: row?.quietHoursStart ?? null,
    quietHoursEnd: row?.quietHoursEnd ?? null,
    feedbackNudgePrefs: sanitizeFeedbackNudgePrefs(row?.feedbackNudgePrefs),
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
  groceryReminderEnabled?: boolean;
  groceryAutoCreateTaskEnabled?: boolean;
  groceryAutoNotifyEnabled?: boolean;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  feedbackNudgePrefs?: unknown;
}): Promise<UserNotificationPreference> {
  const existing = await getUserNotificationPreference(input.userId);
  const existingPrefs = sanitizeFeedbackNudgePrefs(existing.feedbackNudgePrefs);
  const nextFeedbackPrefs =
    input.feedbackNudgePrefs === undefined
      ? existingPrefs
      : mergeFeedbackNudgePrefs(existingPrefs, input.feedbackNudgePrefs);
  const [updated] = await db
    .insert(userNotificationPreferences)
    .values({
      userId: input.userId,
      enabled: input.enabled ?? existing.enabled,
      intensity: clampNotificationIntensity(input.intensity ?? existing.intensity),
      groceryReminderEnabled: input.groceryReminderEnabled ?? existing.groceryReminderEnabled,
      groceryAutoCreateTaskEnabled:
        input.groceryAutoCreateTaskEnabled ?? existing.groceryAutoCreateTaskEnabled,
      groceryAutoNotifyEnabled:
        input.groceryAutoNotifyEnabled ?? existing.groceryAutoNotifyEnabled,
      quietHoursStart: input.quietHoursStart ?? existing.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd ?? existing.quietHoursEnd,
      feedbackNudgePrefs: nextFeedbackPrefs,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userNotificationPreferences.userId,
      set: {
        enabled: input.enabled ?? existing.enabled,
        intensity: clampNotificationIntensity(input.intensity ?? existing.intensity),
        groceryReminderEnabled: input.groceryReminderEnabled ?? existing.groceryReminderEnabled,
        groceryAutoCreateTaskEnabled:
          input.groceryAutoCreateTaskEnabled ?? existing.groceryAutoCreateTaskEnabled,
        groceryAutoNotifyEnabled:
          input.groceryAutoNotifyEnabled ?? existing.groceryAutoNotifyEnabled,
        quietHoursStart: input.quietHoursStart ?? existing.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd ?? existing.quietHoursEnd,
        feedbackNudgePrefs: nextFeedbackPrefs,
        updatedAt: new Date(),
      },
    })
    .returning();
  return normalizeNotificationPreference(input.userId, updated);
}

const DEFAULT_VOICE_LISTENING_MODE: VoiceListeningMode = "wake_after_first_use";

function isVoiceListeningMode(v: string | null | undefined): v is VoiceListeningMode {
  return v === "manual" || v === "wake_after_first_use";
}

function normalizeVoicePreference(userId: string, row?: UserVoicePreference): UserVoicePreference {
  const now = new Date();
  const mode = row?.listeningMode && isVoiceListeningMode(row.listeningMode)
    ? row.listeningMode
    : DEFAULT_VOICE_LISTENING_MODE;
  return {
    userId,
    listeningMode: mode,
    createdAt: row?.createdAt ?? now,
    updatedAt: row?.updatedAt ?? now,
  };
}

export async function getUserVoicePreference(userId: string): Promise<UserVoicePreference> {
  const [row] = await db
    .select()
    .from(userVoicePreferences)
    .where(eq(userVoicePreferences.userId, userId));
  return normalizeVoicePreference(userId, row);
}

export async function upsertUserVoicePreference(input: {
  userId: string;
  listeningMode?: VoiceListeningMode;
}): Promise<UserVoicePreference> {
  const existing = await getUserVoicePreference(input.userId);
  const nextMode = input.listeningMode ?? existing.listeningMode;
  const [updated] = await db
    .insert(userVoicePreferences)
    .values({
      userId: input.userId,
      listeningMode: nextMode,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userVoicePreferences.userId,
      set: {
        listeningMode: nextMode,
        updatedAt: new Date(),
      },
    })
    .returning();
  return normalizeVoicePreference(input.userId, updated);
}

function normalizeCalendarPreference(userId: string, row?: UserCalendarPreference) {
  const now = new Date();
  const code = row?.holidayCountryCode?.trim();
  return {
    userId,
    showHolidays: row?.showHolidays ?? true,
    holidayCountryCode: code && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : null,
    createdAt: row?.createdAt ?? now,
    updatedAt: row?.updatedAt ?? now,
  };
}

export async function getUserCalendarPreference(userId: string) {
  const [row] = await db
    .select()
    .from(userCalendarPreferences)
    .where(eq(userCalendarPreferences.userId, userId));
  return normalizeCalendarPreference(userId, row);
}

export async function upsertUserCalendarPreference(input: {
  userId: string;
  showHolidays?: boolean;
  holidayCountryCode?: string | null;
}) {
  const existing = await getUserCalendarPreference(input.userId);
  const nextShow = input.showHolidays ?? existing.showHolidays;
  let nextCountry = existing.holidayCountryCode;
  if (input.holidayCountryCode !== undefined) {
    nextCountry =
      input.holidayCountryCode === null ? null : input.holidayCountryCode.trim().toUpperCase();
  }
  const [updated] = await db
    .insert(userCalendarPreferences)
    .values({
      userId: input.userId,
      showHolidays: nextShow,
      holidayCountryCode: nextCountry,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userCalendarPreferences.userId,
      set: {
        showHolidays: nextShow,
        holidayCountryCode: nextCountry,
        updatedAt: new Date(),
      },
    })
    .returning();
  return normalizeCalendarPreference(input.userId, updated);
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

type AdherenceStatePatch = {
  lastEvaluatedAt?: Date;
  lastLoginAt?: Date;
  lastTaskMutationAt?: Date;
  lastMissedDueAt?: Date;
  lastReminderIgnoredAt?: Date;
  lastStreakDropAt?: Date;
  lastNoEngagementAt?: Date;
};

export async function getUserAdherenceState(userId: string): Promise<UserAdherenceState | null> {
  const [row] = await db
    .select()
    .from(userAdherenceState)
    .where(eq(userAdherenceState.userId, userId));
  return row ?? null;
}

export async function upsertUserAdherenceState(userId: string, patch: AdherenceStatePatch): Promise<UserAdherenceState> {
  const existing = await getUserAdherenceState(userId);
  const [row] = await db
    .insert(userAdherenceState)
    .values({
      userId,
      lastEvaluatedAt: patch.lastEvaluatedAt ?? existing?.lastEvaluatedAt ?? null,
      lastLoginAt: patch.lastLoginAt ?? existing?.lastLoginAt ?? null,
      lastTaskMutationAt: patch.lastTaskMutationAt ?? existing?.lastTaskMutationAt ?? null,
      lastMissedDueAt: patch.lastMissedDueAt ?? existing?.lastMissedDueAt ?? null,
      lastReminderIgnoredAt: patch.lastReminderIgnoredAt ?? existing?.lastReminderIgnoredAt ?? null,
      lastStreakDropAt: patch.lastStreakDropAt ?? existing?.lastStreakDropAt ?? null,
      lastNoEngagementAt: patch.lastNoEngagementAt ?? existing?.lastNoEngagementAt ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userAdherenceState.userId,
      set: {
        lastEvaluatedAt: patch.lastEvaluatedAt ?? existing?.lastEvaluatedAt ?? null,
        lastLoginAt: patch.lastLoginAt ?? existing?.lastLoginAt ?? null,
        lastTaskMutationAt: patch.lastTaskMutationAt ?? existing?.lastTaskMutationAt ?? null,
        lastMissedDueAt: patch.lastMissedDueAt ?? existing?.lastMissedDueAt ?? null,
        lastReminderIgnoredAt: patch.lastReminderIgnoredAt ?? existing?.lastReminderIgnoredAt ?? null,
        lastStreakDropAt: patch.lastStreakDropAt ?? existing?.lastStreakDropAt ?? null,
        lastNoEngagementAt: patch.lastNoEngagementAt ?? existing?.lastNoEngagementAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function createAdherenceIntervention(input: {
  userId: string;
  signal: AdherenceSignal;
  title: string;
  message: string;
  channel?: "in_app" | "push";
  context?: Record<string, unknown>;
  dedupeKey: string;
}): Promise<UserAdherenceIntervention | null> {
  try {
    const [row] = await db
      .insert(userAdherenceInterventions)
      .values({
        id: randomUUID(),
        userId: input.userId,
        signal: input.signal,
        status: "open",
        title: input.title,
        message: input.message,
        channel: input.channel ?? "in_app",
        contextJson: input.context ? JSON.stringify(input.context) : null,
        dedupeKey: input.dedupeKey,
        updatedAt: new Date(),
      })
      .returning();
    return row ?? null;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "23505") return null;
    throw error;
  }
}

export async function listOpenAdherenceInterventions(userId: string, limit = 10): Promise<UserAdherenceIntervention[]> {
  return db
    .select()
    .from(userAdherenceInterventions)
    .where(and(
      eq(userAdherenceInterventions.userId, userId),
      eq(userAdherenceInterventions.status, "open"),
    ))
    .orderBy(desc(userAdherenceInterventions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function listDispatchableAdherenceInterventions(limit = 100): Promise<UserAdherenceIntervention[]> {
  return db
    .select()
    .from(userAdherenceInterventions)
    .where(and(
      eq(userAdherenceInterventions.status, "open"),
      sql`${userAdherenceInterventions.pushSentAt} IS NULL`,
    ))
    .orderBy(desc(userAdherenceInterventions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function markAdherenceInterventionPushSent(id: string): Promise<void> {
  await db
    .update(userAdherenceInterventions)
    .set({
      pushSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(userAdherenceInterventions.id, id));
}

export async function acknowledgeAdherenceIntervention(
  userId: string,
  id: string,
  action: "acknowledge" | "dismiss" = "acknowledge",
): Promise<boolean> {
  const setValues = action === "dismiss"
    ? {
        status: "dismissed",
        dismissedAt: new Date(),
        updatedAt: new Date(),
      }
    : {
        status: "acknowledged",
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      };
  const rows = await db
    .update(userAdherenceInterventions)
    .set(setValues)
    .where(and(
      eq(userAdherenceInterventions.userId, userId),
      eq(userAdherenceInterventions.id, id),
      eq(userAdherenceInterventions.status, "open"),
    ))
    .returning({ id: userAdherenceInterventions.id });
  return rows.length > 0;
}

export async function listRecentAdherenceInterventions(
  userId: string,
  signal?: AdherenceSignal,
  limit = 20,
): Promise<UserAdherenceIntervention[]> {
  const whereClause = signal
    ? and(eq(userAdherenceInterventions.userId, userId), eq(userAdherenceInterventions.signal, signal))
    : eq(userAdherenceInterventions.userId, userId);
  return db
    .select()
    .from(userAdherenceInterventions)
    .where(whereClause)
    .orderBy(desc(userAdherenceInterventions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function getLatestTaskMutationAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ value: sql<Date | null>`max(${tasks.updatedAt})` })
    .from(tasks)
    .where(eq(tasks.userId, userId));
  return row?.value ?? null;
}

export async function getLatestLoginAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ value: sql<Date | null>`max(${securityEvents.createdAt})` })
    .from(securityEvents)
    .where(and(
      eq(securityEvents.actorUserId, userId),
      eq(securityEvents.eventType, "auth_login_success"),
    ));
  return row?.value ?? null;
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

// ─── User classification labels ───────────────────────────────────────────────

export async function listUserClassificationLabels(
  userId: string,
): Promise<{ id: string; label: string; coins: number }[]> {
  return db
    .select({
      id: userClassificationLabels.id,
      label: userClassificationLabels.label,
      coins: userClassificationLabels.coins,
    })
    .from(userClassificationLabels)
    .where(eq(userClassificationLabels.userId, userId))
    .orderBy(asc(userClassificationLabels.label));
}

function isPostgresUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const o = e as { code?: string; cause?: unknown };
  if (o.code === "23505") return true;
  if (o.cause && typeof o.cause === "object" && (o.cause as { code?: string }).code === "23505") {
    return true;
  }
  return false;
}

async function getUserClassificationLabelByUserLower(
  userId: string,
  labelLower: string,
): Promise<{ id: string; label: string; coins: number } | undefined> {
  const [row] = await db
    .select()
    .from(userClassificationLabels)
    .where(
      and(
        eq(userClassificationLabels.userId, userId),
        eq(userClassificationLabels.labelLower, labelLower),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  return { id: row.id, label: row.label, coins: row.coins };
}

export async function addUserClassificationLabel(
  userId: string,
  rawLabel: string,
): Promise<{ id: string; label: string; coins: number }> {
  const label = rawLabel.trim();
  if (label.length < 2) {
    throw new Error("Name must be at least 2 characters.");
  }
  if (label.length > 48) {
    throw new Error("Name must be at most 48 characters.");
  }

  try {
    const [row] = await db
      .insert(userClassificationLabels)
      .values({ id: randomUUID(), userId, label, coins: 3 })
      .returning();
    if (row) {
      return { id: row.id, label: row.label, coins: row.coins };
    }
  } catch (e: unknown) {
    if (!isPostgresUniqueViolation(e)) throw e;
  }

  const existing = await getUserClassificationLabelByUserLower(userId, label.toLowerCase());
  if (existing) return existing;
  throw new Error("Could not create or load classification label.");
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
      )
      .orderBy(desc(tasks.updatedAt), desc(tasks.createdAt))
      .limit(TASK_SEARCH_RESULT_LIMIT);
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

      const associationsCase = sql.join(
        [
          sql`CASE`,
          ...batch.map((u) => {
            const val = u.classificationAssociations;
            if (val === undefined) {
              return sql`WHEN id = ${u.id} THEN classification_associations`;
            }
            const escaped = JSON.stringify(val).replace(/\\/g, "\\\\").replace(/'/g, "''");
            return sql`WHEN id = ${u.id} THEN ${sql.raw(`'${escaped}'::jsonb`)}`;
          }),
          sql`ELSE classification_associations END`,
        ],
        sql` `,
      );

      const idParams = batch.map(u => sql`${u.id}`);

      await db.execute(sql`
        UPDATE tasks SET
          priority = ${buildCase('priority', u => u.priority)},
          priority_score = ${buildCase('priority_score', u => u.priorityScore)},
          classification = ${buildCase('classification', u => u.classification)},
          classification_associations = ${associationsCase},
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

    const rawAvg = Number(avgRow?.value) || 0;
    return {
      totalTasks: Number(totalRow?.value) || 0,
      highPriorityTasks: Number(highPriorityRow?.value) || 0,
      completedToday: Number(completedTodayRow?.value) || 0,
      /** Same scale as task list / planner: DB stores score × 10. */
      avgPriorityScore: displayAveragePriorityScoreFromDb(rawAvg),
    };
  }
}

export const storage = new DatabaseStorage();

// ─── Study mini-game storage ─────────────────────────────────────────────────
export async function listStudyDecks(userId: string): Promise<StudyDeck[]> {
  return db
    .select()
    .from(studyDecks)
    .where(eq(studyDecks.userId, userId))
    .orderBy(desc(studyDecks.updatedAt));
}

export async function createStudyDeck(userId: string, input: CreateStudyDeckInput): Promise<StudyDeck> {
  const [deck] = await db.insert(studyDecks).values({
    id: randomUUID(),
    userId,
    title: input.title,
    description: input.description || null,
    sourceType: input.sourceType || "manual",
    sourceRef: input.sourceRef || null,
    cardLimitPerSession: input.cardLimitPerSession ?? 10,
    sessionDurationMinutes: input.sessionDurationMinutes ?? 5,
    updatedAt: new Date(),
  }).returning();
  return deck;
}

export async function listStudyCards(userId: string, deckId: string): Promise<StudyCard[]> {
  return db
    .select()
    .from(studyCards)
    .where(and(eq(studyCards.userId, userId), eq(studyCards.deckId, deckId)))
    .orderBy(asc(studyCards.createdAt));
}

export async function createStudyCard(
  userId: string,
  deckId: string,
  input: CreateStudyCardInput,
): Promise<StudyCard> {
  const [card] = await db.insert(studyCards).values({
    id: randomUUID(),
    deckId,
    userId,
    prompt: input.prompt,
    answer: input.answer,
    topic: input.topic || null,
    tagsJson: input.tagsJson || null,
    sourceTaskId: input.sourceTaskId || null,
    updatedAt: new Date(),
  }).returning();
  await db.update(studyDecks).set({ updatedAt: new Date() }).where(and(
    eq(studyDecks.id, deckId),
    eq(studyDecks.userId, userId),
  ));
  return card;
}

export async function startStudySession(userId: string, input: StartStudySessionInput): Promise<StudySession> {
  const cards = await listStudyCards(userId, input.deckId);
  const [session] = await db.insert(studySessions).values({
    id: randomUUID(),
    userId,
    deckId: input.deckId,
    gameType: input.gameType || "flashcard_sprint",
    status: "active",
    totalCards: cards.length,
    updatedAt: new Date(),
  }).returning();
  return session;
}

function gradeToCorrect(grade: SubmitStudyAnswerInput["grade"]): boolean {
  return grade === "good" || grade === "easy";
}

export async function submitStudyAnswer(
  userId: string,
  sessionId: string,
  input: SubmitStudyAnswerInput,
): Promise<{ session: StudySession; event: StudyReviewEvent; awardedCoins: number }> {
  const [session] = await db.select().from(studySessions).where(and(
    eq(studySessions.id, sessionId),
    eq(studySessions.userId, userId),
  ));
  if (!session) {
    throw new Error("Session not found");
  }
  if (session.status !== "active") {
    throw new Error("Session is not active");
  }

  const isCorrect = gradeToCorrect(input.grade);
  const [event] = await db.insert(studyReviewEvents).values({
    id: randomUUID(),
    userId,
    sessionId,
    cardId: input.cardId,
    grade: input.grade,
    isCorrect,
    responseMs: input.responseMs ?? null,
  }).returning();

  const allEvents = await db
    .select()
    .from(studyReviewEvents)
    .where(eq(studyReviewEvents.sessionId, sessionId));
  const answeredCards = allEvents.length;
  const correctCards = allEvents.filter((row) => row.isCorrect).length;
  const scorePercent = answeredCards > 0 ? Math.round((correctCards / answeredCards) * 100) : 0;
  const avgResponseMs = allEvents.length > 0
    ? Math.round(allEvents.reduce((sum, row) => sum + (row.responseMs || 0), 0) / allEvents.length)
    : null;

  const weakTopicRows = await db
    .select({ topic: studyCards.topic, isCorrect: studyReviewEvents.isCorrect })
    .from(studyReviewEvents)
    .innerJoin(studyCards, eq(studyReviewEvents.cardId, studyCards.id))
    .where(eq(studyReviewEvents.sessionId, sessionId));
  const topicCounts = new Map<string, { total: number; correct: number }>();
  for (const row of weakTopicRows) {
    const topic = (row.topic || "general").trim().toLowerCase();
    const entry = topicCounts.get(topic) || { total: 0, correct: 0 };
    entry.total += 1;
    if (row.isCorrect) entry.correct += 1;
    topicCounts.set(topic, entry);
  }
  const weakTopics = Array.from(topicCounts.entries())
    .filter(([, value]) => value.total > 0 && (value.correct / value.total) < 0.5)
    .map(([topic]) => topic);

  let status: StudySession["status"] = "active";
  let endedAt: Date | null = null;
  let awardedCoins = 0;
  const totalCardsForCompletion = Math.max(session.totalCards, answeredCards);
  if (answeredCards >= totalCardsForCompletion) {
    status = "completed";
    endedAt = new Date();
    awardedCoins = Math.max(5, Math.min(25, Math.round(scorePercent / 5)));
    await addCoins(
      userId,
      awardedCoins,
      "study_session_completed",
      `Flashcard Sprint completed (${scorePercent}% accuracy)`,
    );
  }

  const [updated] = await db.update(studySessions).set({
    status,
    endedAt,
    answeredCards,
    correctCards,
    scorePercent,
    avgResponseMs,
    weakTopicsJson: JSON.stringify(weakTopics),
    rewardCoins: status === "completed" ? awardedCoins : session.rewardCoins,
    updatedAt: new Date(),
  }).where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId))).returning();

  return { session: updated, event, awardedCoins };
}

export async function getStudySessionSummary(userId: string, sessionId: string): Promise<StudySession | undefined> {
  const [session] = await db.select().from(studySessions).where(and(
    eq(studySessions.id, sessionId),
    eq(studySessions.userId, userId),
  ));
  return session || undefined;
}

export async function getStudyStats(userId: string): Promise<{
  totalSessions: number;
  completedSessions: number;
  avgScorePercent: number;
  totalCardsReviewed: number;
}> {
  const sessions = await db.select().from(studySessions).where(eq(studySessions.userId, userId));
  const totalSessions = sessions.length;
  const completed = sessions.filter((row) => row.status === "completed");
  const completedSessions = completed.length;
  const avgScorePercent = completedSessions > 0
    ? Math.round(completed.reduce((sum, row) => sum + (row.scorePercent || 0), 0) / completedSessions)
    : 0;
  const totalCardsReviewed = sessions.reduce((sum, row) => sum + (row.answeredCards || 0), 0);
  return { totalSessions, completedSessions, avgScorePercent, totalCardsReviewed };
}

// ─── Gamification Storage ────────────────────────────────────────────────────

export async function getOrCreateWallet(userId: string): Promise<Wallet> {
  const [existing] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (existing) return existing;
  const [wallet] = await db.insert(wallets).values({ userId }).returning();
  return wallet;
}

const MAX_CHIP_REQUEST_MS = 20_000;
const CHIP_CLOCK_SLACK_MS = 1_500;

/**
 * Applies client-reported ambient chip hunt deltas with per-request and wall-clock caps.
 */
export async function applyChipHuntSync(
  userId: string,
  chaseMsDeltaRaw: number,
  catchRequested: boolean,
): Promise<{ wallet: Wallet; acceptedChaseMs: number; catchIncremented: boolean }> {
  const wallet = await getOrCreateWallet(userId);
  const now = new Date();
  let accepted = Math.min(Math.max(0, Math.floor(chaseMsDeltaRaw)), MAX_CHIP_REQUEST_MS);
  if (wallet.chipHuntLastSyncAt) {
    const elapsed = now.getTime() - new Date(wallet.chipHuntLastSyncAt).getTime();
    accepted = Math.min(accepted, Math.max(0, elapsed) + CHIP_CLOCK_SLACK_MS);
  }

  const catchIncremented = Boolean(catchRequested && wallet.chipCatchesCount === 0);
  const prevTotal = Number(wallet.chipChaseMsTotal) || 0;
  const newChaseTotal = Math.min(prevTotal + accepted, Number.MAX_SAFE_INTEGER);
  const newCatchCount = catchIncremented ? 1 : wallet.chipCatchesCount;

  const [updated] = await db
    .update(wallets)
    .set({
      chipChaseMsTotal: newChaseTotal,
      chipCatchesCount: newCatchCount,
      chipHuntLastSyncAt: now,
    })
    .where(eq(wallets.userId, userId))
    .returning();

  return {
    wallet: updated!,
    acceptedChaseMs: accepted,
    catchIncremented,
  };
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

export async function spendCoins(userId: string, amount: number, reason: string): Promise<Wallet | null> {
  await getOrCreateWallet(userId);
  const [updated] = await db
    .update(wallets)
    .set({ balance: sql`${wallets.balance} - ${amount}` })
    .where(and(eq(wallets.userId, userId), sql`${wallets.balance} >= ${amount}`))
    .returning();
  if (!updated) return null;
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

export async function resetStreak(userId: string): Promise<void> {
  await db
    .update(wallets)
    .set({ currentStreak: 0 })
    .where(eq(wallets.userId, userId));
}

const COMBO_WINDOW_MINUTES = 60;

export async function updateComboChainOnCompletion(userId: string, completedAt = new Date()): Promise<Wallet> {
  const wallet = await getOrCreateWallet(userId);
  const comboWindowMs = COMBO_WINDOW_MINUTES * 60 * 1000;
  const lastCompletionAt = wallet.lastCompletionAt ? new Date(wallet.lastCompletionAt) : null;
  const comboWindowStartedAt = wallet.comboWindowStartedAt ? new Date(wallet.comboWindowStartedAt) : completedAt;
  const isInComboWindow = lastCompletionAt && (completedAt.getTime() - lastCompletionAt.getTime()) <= comboWindowMs;

  const comboCount = isInComboWindow ? wallet.comboCount + 1 : 1;
  const bestComboCount = Math.max(wallet.bestComboCount, comboCount);
  const nextComboWindowStartedAt = isInComboWindow ? comboWindowStartedAt : completedAt;

  const since = new Date(completedAt.getTime() - (24 * 60 * 60 * 1000));
  const [chainRow] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(and(
      eq(coinTransactions.userId, userId),
      eq(coinTransactions.reason, "task_completion"),
      gte(coinTransactions.createdAt, since),
    ));
  const chainCount24h = Number(chainRow?.value) || 0;
  const bestChainCount24h = Math.max(wallet.bestChainCount24h, chainCount24h);

  const [updated] = await db
    .update(wallets)
    .set({
      comboCount,
      bestComboCount,
      comboWindowStartedAt: nextComboWindowStartedAt,
      lastCompletionAt: completedAt,
      chainCount24h,
      bestChainCount24h,
    })
    .where(eq(wallets.userId, userId))
    .returning();
  return updated;
}

export async function getFeedbackSubmissionCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(and(
      eq(coinTransactions.userId, userId),
      eq(coinTransactions.reason, "feedback_submission_reward"),
    ));
  return Number(row?.value) || 0;
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

export async function getMaxAvatarLevel(userId: string): Promise<number> {
  const [row] = await db
    .select({ m: sql<number>`coalesce(max(${userAvatarProfiles.level}), 0)` })
    .from(userAvatarProfiles)
    .where(eq(userAvatarProfiles.userId, userId));
  return Number(row?.m) || 0;
}

export async function redeemReward(userId: string, rewardId: string): Promise<boolean> {
  const reward = await getRewardById(rewardId);
  if (!reward) return false;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ value: count() })
      .from(userRewards)
      .where(and(eq(userRewards.userId, userId), eq(userRewards.rewardId, rewardId)));
    if ((Number(existing?.value) || 0) > 0) return false;

    const [levelRow] = await tx
      .select({ m: sql<number>`coalesce(max(${userAvatarProfiles.level}), 0)` })
      .from(userAvatarProfiles)
      .where(eq(userAvatarProfiles.userId, userId));
    const maxLevel = Number(levelRow?.m) || 0;
    const qualifiesByLevel =
      reward.unlockAtAvatarLevel != null && maxLevel >= reward.unlockAtAvatarLevel;

    if (qualifiesByLevel) {
      await tx.insert(coinTransactions).values({
        id: randomUUID(),
        userId,
        amount: 0,
        reason: "reward_avatar_level_unlock",
        details: `Unlocked at avatar level ${maxLevel}: ${reward.name}`,
      });
      await tx.insert(userRewards).values({
        id: randomUUID(),
        userId,
        rewardId,
        coinsSpentAtRedeem: 0,
      });
      return true;
    }

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

    await tx.insert(userRewards).values({
      id: randomUUID(),
      userId,
      rewardId,
      coinsSpentAtRedeem: reward.cost,
    });
    return true;
  });
}

const REWARD_SELL_BACK_FRACTION = 0.7;

export async function sellBackUserReward(
  userId: string,
  userRewardId: string,
): Promise<
  | { ok: true; refund: number; wallet: Wallet }
  | { ok: false; code: "not_found" }
> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(userRewards)
      .where(and(eq(userRewards.id, userRewardId), eq(userRewards.userId, userId)));
    if (!row) return { ok: false, code: "not_found" };

    const refund = Math.floor(Number(row.coinsSpentAtRedeem) * REWARD_SELL_BACK_FRACTION);
    if (refund > 0) {
      await tx
        .update(wallets)
        .set({
          balance: sql`${wallets.balance} + ${refund}`,
          lifetimeEarned: sql`${wallets.lifetimeEarned} + ${refund}`,
        })
        .where(eq(wallets.userId, userId));
      await tx.insert(coinTransactions).values({
        id: randomUUID(),
        userId,
        amount: refund,
        reason: "reward_sell_back",
        details:
          row.coinsSpentAtRedeem > 0
            ? `Sell-back (${Math.round(REWARD_SELL_BACK_FRACTION * 100)}% of ${row.coinsSpentAtRedeem} coins spent)`
            : "Sell-back (no coin refund — was avatar-level unlock)",
      });
    }

    await tx.delete(userRewards).where(eq(userRewards.id, userRewardId));

    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId));
    return { ok: true, refund, wallet: wallet! };
  });
}

export async function ownerGrantCoinsToUser(
  targetUserId: string,
  amount: number,
  note?: string,
): Promise<{ ok: true; wallet: Wallet } | { ok: false; code: "invalid_amount" | "user_not_found" }> {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000 || !Number.isInteger(amount)) {
    return { ok: false, code: "invalid_amount" };
  }
  const target = await getUserById(targetUserId);
  if (!target) return { ok: false, code: "user_not_found" };
  const { wallet } = await addCoins(
    targetUserId,
    amount,
    "owner_coin_grant",
    note?.trim() ? `Owner grant: ${note.trim()}` : "Owner grant",
  );
  return { ok: true, wallet };
}

const CLASSIFICATION_THUMB_COINS = 3;

export async function getClassificationThumbState(
  taskId: string,
  userId: string,
): Promise<{ voted: boolean }> {
  const [row] = await db
    .select({ id: taskClassificationThumbs.id })
    .from(taskClassificationThumbs)
    .where(and(eq(taskClassificationThumbs.taskId, taskId), eq(taskClassificationThumbs.userId, userId)))
    .limit(1);
  return { voted: !!row };
}

export type ClassificationThumbResult =
  | { ok: true; coinsEarned: number; newBalance: number }
  | { ok: false; code: "task_not_found" | "no_classification" | "already_voted" };

export async function awardClassificationThumbUp(
  userId: string,
  taskId: string,
): Promise<ClassificationThumbResult> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);
  if (!task) return { ok: false, code: "task_not_found" };
  const cls = (task.classification || "").trim();
  if (!cls || cls === "General") return { ok: false, code: "no_classification" };

  const inserted = await db
    .insert(taskClassificationThumbs)
    .values({ id: randomUUID(), taskId, userId })
    .onConflictDoNothing({ target: [taskClassificationThumbs.taskId, taskClassificationThumbs.userId] })
    .returning({ id: taskClassificationThumbs.id });
  if (!inserted.length) return { ok: false, code: "already_voted" };

  const { wallet } = await addCoins(
    userId,
    CLASSIFICATION_THUMB_COINS,
    "classification_thumbs_up",
    `Thumbs up on ${cls} classification`,
    taskId,
  );
  return { ok: true, coinsEarned: CLASSIFICATION_THUMB_COINS, newBalance: wallet.balance };
}

export async function listUserAlarmSnapshots(userId: string): Promise<UserAlarmSnapshot[]> {
  return db
    .select()
    .from(userAlarmSnapshots)
    .where(eq(userAlarmSnapshots.userId, userId))
    .orderBy(desc(userAlarmSnapshots.capturedAt))
    .limit(50);
}

export async function createUserAlarmSnapshot(
  userId: string,
  input: { deviceKey?: string; label?: string; payloadJson: string },
): Promise<UserAlarmSnapshot> {
  const [row] = await db
    .insert(userAlarmSnapshots)
    .values({
      id: randomUUID(),
      userId,
      deviceKey: input.deviceKey ?? "default",
      label: input.label ?? "capture",
      payloadJson: input.payloadJson,
    })
    .returning();
  return row;
}

export async function getUserAlarmSnapshot(
  userId: string,
  snapshotId: string,
): Promise<UserAlarmSnapshot | undefined> {
  const [row] = await db
    .select()
    .from(userAlarmSnapshots)
    .where(and(eq(userAlarmSnapshots.id, snapshotId), eq(userAlarmSnapshots.userId, userId)))
    .limit(1);
  return row;
}

export async function listCollaborationInbox(
  userId: string,
  limit = 50,
): Promise<CollaborationInboxMessage[]> {
  return db
    .select()
    .from(collaborationInboxMessages)
    .where(eq(collaborationInboxMessages.userId, userId))
    .orderBy(desc(collaborationInboxMessages.createdAt))
    .limit(limit);
}

export async function appendCollaborationMessage(input: {
  userId: string;
  body: string;
  taskId?: string | null;
  senderUserId?: string | null;
}): Promise<CollaborationInboxMessage> {
  const [row] = await db
    .insert(collaborationInboxMessages)
    .values({
      id: randomUUID(),
      userId: input.userId,
      body: input.body,
      taskId: input.taskId ?? null,
      senderUserId: input.senderUserId ?? null,
    })
    .returning();
  return row;
}

export async function markCollaborationMessageRead(userId: string, messageId: string): Promise<boolean> {
  const [row] = await db
    .update(collaborationInboxMessages)
    .set({ readAt: new Date() })
    .where(
      and(eq(collaborationInboxMessages.id, messageId), eq(collaborationInboxMessages.userId, userId)),
    )
    .returning({ id: collaborationInboxMessages.id });
  return !!row;
}

export async function listUserLocationPlaces(userId: string): Promise<UserLocationPlace[]> {
  return db
    .select()
    .from(userLocationPlaces)
    .where(eq(userLocationPlaces.userId, userId))
    .orderBy(desc(userLocationPlaces.updatedAt));
}

export async function upsertUserLocationPlace(
  userId: string,
  input: { id?: string; name: string; lat?: number | null; lng?: number | null; radiusMeters?: number },
): Promise<UserLocationPlace | undefined> {
  if (input.id) {
    const [u] = await db
      .update(userLocationPlaces)
      .set({
        name: input.name,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        radiusMeters: input.radiusMeters ?? 200,
        updatedAt: new Date(),
      })
      .where(and(eq(userLocationPlaces.id, input.id), eq(userLocationPlaces.userId, userId)))
      .returning();
    if (u) return u;
  }
  const [row] = await db
    .insert(userLocationPlaces)
    .values({
      id: randomUUID(),
      userId,
      name: input.name,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      radiusMeters: input.radiusMeters ?? 200,
    })
    .returning();
  return row;
}

export async function getCommunityMomentumStats(): Promise<{
  postsLast24h: number;
  repliesLast24h: number;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [p] = await db
    .select({ c: count() })
    .from(communityPosts)
    .where(gte(communityPosts.createdAt, since));
  const [r] = await db
    .select({ c: count() })
    .from(communityReplies)
    .where(gte(communityReplies.createdAt, since));
  return { postsLast24h: Number(p?.c) || 0, repliesLast24h: Number(r?.c) || 0 };
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
    { id: randomUUID(), name: "Avatar Support Unlock", description: "Unlock the avatar support tree for guided task management", cost: 220, type: "avatar_support", icon: "🧭", data: "avatar-support-unlock" },
    {
      id: randomUUID(),
      name: "Gantt Timeline Pack",
      description: "Unlock swimlanes by classification, dependency arrows, critical-path highlight, priority coloring, and PNG export for the task Gantt view.",
      cost: 250,
      unlockAtAvatarLevel: 3,
      type: "gantt_pack",
      icon: "📊",
      data: "gantt-custom",
    },
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

const DEFAULT_AVATAR_PROFILES: Array<{
  avatarKey: "mood" | "archetype" | "productivity" | "social" | "lazy";
  displayName: string;
  archetypeKey: string;
  mission: string;
}> = [
  { avatarKey: "mood", displayName: "Moodweaver", archetypeKey: "momentum", mission: "Complete tasks while tracking your energy shifts." },
  { avatarKey: "archetype", displayName: "Archon", archetypeKey: "strategy", mission: "Clarify one high-leverage next action and complete it." },
  { avatarKey: "productivity", displayName: "Cadence", archetypeKey: "execution", mission: "Ship a focused task block without context switching." },
  { avatarKey: "social", displayName: "Nexus", archetypeKey: "collaboration", mission: "Complete a task that helps or unblocks someone else." },
  { avatarKey: "lazy", displayName: "Drift", archetypeKey: "recovery", mission: "Balance progress with recovery and calmer pacing." },
];

const AVATAR_SKILL_TREE: Array<{
  skillKey: string;
  name: string;
  description: string;
  branch: string;
  maxLevel: number;
  baseCost: number;
  effectType:
    | "entourage_slots"
    | "guidance_depth"
    | "context_points"
    | "resource_budget"
    | "export_coin_discount"
    | "shopping_list_surface";
  effectPerLevel: number;
  prerequisiteSkillKey: string | null;
  sortOrder: number;
}> = [
  {
    skillKey: "entourage-slots",
    name: "Entourage Slots",
    description: "Increase simultaneous active task companions.",
    branch: "companions",
    maxLevel: 4,
    baseCost: 130,
    effectType: "entourage_slots",
    effectPerLevel: 1,
    prerequisiteSkillKey: null,
    sortOrder: 1,
  },
  {
    skillKey: "guidance-depth",
    name: "Guidance Depth",
    description: "Companions provide more specific task guidance.",
    branch: "guidance",
    maxLevel: 5,
    baseCost: 170,
    effectType: "guidance_depth",
    effectPerLevel: 1,
    prerequisiteSkillKey: null,
    sortOrder: 2,
  },
  {
    skillKey: "context-memory",
    name: "Context Memory",
    description: "Uses more historical data points in recommendations.",
    branch: "analysis",
    maxLevel: 4,
    baseCost: 220,
    effectType: "context_points",
    effectPerLevel: 2,
    prerequisiteSkillKey: "guidance-depth",
    sortOrder: 3,
  },
  {
    skillKey: "resource-orchestration",
    name: "Resource Orchestration",
    description: "Allocates more resource budget to contextualized guidance.",
    branch: "analysis",
    maxLevel: 3,
    baseCost: 280,
    effectType: "resource_budget",
    effectPerLevel: 1,
    prerequisiteSkillKey: "context-memory",
    sortOrder: 4,
  },
  {
    skillKey: "export-efficiency",
    name: "Export Efficiency",
    description: "Reduces AxCoin cost for checklist exports, spreadsheets, and task reports.",
    branch: "productivity",
    maxLevel: 8,
    baseCost: 90,
    effectType: "export_coin_discount",
    effectPerLevel: 1,
    prerequisiteSkillKey: null,
    sortOrder: 5,
  },
  {
    skillKey: "dendritic-shopping-list",
    name: "Dendritic List Sense",
    description:
      "Unlocks the dedicated shopping list workspace and printable or spreadsheet checklist exports for NodeWeaver-classified errands.",
    branch: "dendritic",
    maxLevel: 1,
    baseCost: 140,
    effectType: "shopping_list_surface",
    effectPerLevel: 0,
    prerequisiteSkillKey: "export-efficiency",
    sortOrder: 6,
  },
];

function avatarXpThreshold(level: number): number {
  return 100 + Math.max(0, level - 1) * 25;
}

async function getOrCreateAvatarProfiles(userId: string): Promise<UserAvatarProfile[]> {
  const existing = await db.select().from(userAvatarProfiles).where(eq(userAvatarProfiles.userId, userId));
  if (existing.length > 0) return existing;
  await db.insert(userAvatarProfiles).values(
    DEFAULT_AVATAR_PROFILES.map((profile) => ({
      id: randomUUID(),
      userId,
      avatarKey: profile.avatarKey,
      displayName: profile.displayName,
      archetypeKey: profile.archetypeKey,
      mission: profile.mission,
      level: 1,
      xp: 0,
      totalXp: 0,
      updatedAt: new Date(),
    })),
  );
  return db.select().from(userAvatarProfiles).where(eq(userAvatarProfiles.userId, userId));
}

export async function seedAvatarSkillTree(): Promise<void> {
  const existing = await db.select().from(avatarSkillNodes);
  if (existing.length === 0) {
    await db.insert(avatarSkillNodes).values(
      AVATAR_SKILL_TREE.map((skill) => ({
        id: randomUUID(),
        ...skill,
      })),
    );
  } else {
    for (const skill of AVATAR_SKILL_TREE) {
      await db
        .insert(avatarSkillNodes)
        .values({
          id: randomUUID(),
          ...skill,
        })
        .onConflictDoNothing({ target: avatarSkillNodes.skillKey });
    }
  }
}

export async function getAvatarProfiles(userId: string): Promise<UserAvatarProfile[]> {
  const profiles = await getOrCreateAvatarProfiles(userId);
  return [...profiles].sort((a, b) => a.avatarKey.localeCompare(b.avatarKey));
}

/** Dominant analytical archetype from companion XP (see `server/lib/poll-archetype.ts`). */
export async function getDominantArchetypeKeyForUser(userId: string): Promise<ArchetypeKey> {
  const profiles = await getOrCreateAvatarProfiles(userId);
  const key = dominantArchetypeFromAvatarProfiles(profiles);
  if (key) return key;
  return "momentum";
}

async function getUserAvatarSkillLevels(userId: string): Promise<Array<UserAvatarSkill & { skillNode: AvatarSkillNode }>> {
  const rows = await db.select().from(userAvatarSkills).where(eq(userAvatarSkills.userId, userId));
  if (rows.length === 0) return [];
  const nodeIds = rows.map((row) => row.skillNodeId);
  const nodes = await db.select().from(avatarSkillNodes).where(inArray(avatarSkillNodes.id, nodeIds));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return rows
    .map((row) => {
      const skillNode = nodeById.get(row.skillNodeId);
      if (!skillNode) return null;
      return { ...row, skillNode };
    })
    .filter((row): row is UserAvatarSkill & { skillNode: AvatarSkillNode } => Boolean(row));
}

export async function getAvatarSkillTree(userId: string): Promise<Array<{
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
  effectType: string;
  effectPerLevel: number;
}>> {
  await seedAvatarSkillTree();
  const [nodes, userSkills] = await Promise.all([
    db.select().from(avatarSkillNodes).orderBy(asc(avatarSkillNodes.sortOrder), asc(avatarSkillNodes.name)),
    getUserAvatarSkillLevels(userId),
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
      effectType: node.effectType,
      effectPerLevel: node.effectPerLevel,
    };
  });
}

export async function userHasAvatarSkillUnlocked(userId: string, skillKey: string): Promise<boolean> {
  await seedAvatarSkillTree();
  const [node] = await db.select().from(avatarSkillNodes).where(eq(avatarSkillNodes.skillKey, skillKey)).limit(1);
  if (!node) return false;
  const [row] = await db
    .select({ level: userAvatarSkills.level })
    .from(userAvatarSkills)
    .innerJoin(avatarSkillNodes, eq(userAvatarSkills.skillNodeId, avatarSkillNodes.id))
    .where(and(eq(userAvatarSkills.userId, userId), eq(avatarSkillNodes.skillKey, skillKey)))
    .limit(1);
  return (row?.level ?? 0) > 0;
}

export async function unlockAvatarSkill(userId: string, skillKey: string): Promise<{ ok: boolean; message: string }> {
  const [node] = await db.select().from(avatarSkillNodes).where(eq(avatarSkillNodes.skillKey, skillKey));
  if (!node) return { ok: false, message: "Avatar skill not found." };
  const unlockedSkills = await getUserAvatarSkillLevels(userId);
  const existing = unlockedSkills.find((row) => row.skillNode.id === node.id);
  const currentLevel = existing?.level ?? 0;
  if (currentLevel >= node.maxLevel) return { ok: false, message: "Avatar skill is already maxed." };
  if (node.prerequisiteSkillKey) {
    const prereqLevel = unlockedSkills.find((row) => row.skillNode.skillKey === node.prerequisiteSkillKey)?.level ?? 0;
    if (prereqLevel <= 0) return { ok: false, message: `Unlock prerequisite skill '${node.prerequisiteSkillKey}' first.` };
  }
  const cost = computeSkillUpgradeCost(node.baseCost, currentLevel);
  const wallet = await spendCoins(userId, cost, `avatar_skill_upgrade:${skillKey}`);
  if (!wallet) return { ok: false, message: `Need ${cost} coins to unlock or upgrade this skill.` };
  if (existing) {
    await db.update(userAvatarSkills).set({ level: existing.level + 1, updatedAt: new Date() }).where(eq(userAvatarSkills.id, existing.id));
  } else {
    await db.insert(userAvatarSkills).values({
      id: randomUUID(),
      userId,
      skillNodeId: node.id,
      level: 1,
      updatedAt: new Date(),
    });
  }
  return { ok: true, message: "Avatar skill upgraded successfully." };
}

export async function engageAvatarMission(input: {
  userId: string;
  avatarKey: string;
  sourceType: "task" | "feedback" | "post";
  sourceRef: string;
  text: string;
  completed: boolean;
}): Promise<{ awarded: boolean; xp: number; coins: number; message?: string; avatarNextLevelXp?: number; avatarLevel?: number }> {
  const profileRows = await getOrCreateAvatarProfiles(input.userId);
  const profile = profileRows.find((row) => row.avatarKey === input.avatarKey);
  if (!profile) return { awarded: false, xp: 0, coins: 0, message: "Avatar not found." };
  const [alreadyClaimed] = await db.select({ value: count() }).from(coinTransactions).where(and(
    eq(coinTransactions.userId, input.userId),
    eq(coinTransactions.reason, "avatar_mission"),
    eq(coinTransactions.taskId, input.sourceRef),
  ));
  if ((Number(alreadyClaimed?.value) || 0) > 0) {
    return { awarded: false, xp: 0, coins: 0, message: "This mission source was already claimed." };
  }
  if (!input.completed) {
    return { awarded: false, xp: 0, coins: 0, message: "Mission progress only counts for completed submissions." };
  }
  const archetypeMentioned = input.text.toLowerCase().includes(profile.archetypeKey.toLowerCase());
  const xpGain = 18 + (archetypeMentioned ? 8 : 0) + (input.sourceType === "feedback" ? 4 : 0);
  let nextLevel = profile.level;
  let nextXp = profile.xp + xpGain;
  let levelUps = 0;
  while (nextXp >= avatarXpThreshold(nextLevel)) {
    nextXp -= avatarXpThreshold(nextLevel);
    nextLevel += 1;
    levelUps += 1;
  }
  const totalXp = profile.totalXp + xpGain;
  const missionCoins = 6 + (levelUps * 8);
  const flavorByAvatar: Record<string, string> = {
    mood: "Moodweaver tracks your momentum and keeps your streak emotionally sustainable.",
    archetype: "Archon sharpened your next-step strategy with stronger context.",
    productivity: "Cadence tightened your execution rhythm for cleaner completions.",
    social: "Nexus amplified your collaborative signal and follow-through.",
    lazy: "Drift helped preserve calm pacing while still moving the plan forward.",
  };
  await db.update(userAvatarProfiles).set({
    level: nextLevel,
    xp: nextXp,
    totalXp,
    updatedAt: new Date(),
  }).where(eq(userAvatarProfiles.id, profile.id));
  await db.insert(coinTransactions).values({
    id: randomUUID(),
    userId: input.userId,
    amount: 0,
    reason: "avatar_mission",
    details: `Mission ${input.avatarKey}/${input.sourceType}`,
    taskId: input.sourceRef,
  });
  await addCoins(input.userId, missionCoins, "avatar_mission_reward", `${profile.displayName} mission reward`, input.sourceRef);
  return {
    awarded: true,
    xp: xpGain,
    coins: missionCoins,
    message: flavorByAvatar[input.avatarKey] ?? "Your avatar support has become more precise.",
    avatarNextLevelXp: avatarXpThreshold(nextLevel),
    avatarLevel: nextLevel,
  };
}

export async function spendCoinsForAvatarBoost(userId: string, avatarKey: string, coins: number): Promise<{ ok: boolean; message: string; profile?: UserAvatarProfile }> {
  if (!Number.isFinite(coins) || coins <= 0) return { ok: false, message: "Invalid coin amount." };
  const profileRows = await getOrCreateAvatarProfiles(userId);
  const profile = profileRows.find((row) => row.avatarKey === avatarKey);
  if (!profile) return { ok: false, message: "Avatar not found." };
  const wallet = await spendCoins(userId, coins, `avatar_boost:${avatarKey}`);
  if (!wallet) return { ok: false, message: `Need ${coins} coins to boost this avatar.` };
  let nextLevel = profile.level;
  let nextXp = profile.xp + coins;
  while (nextXp >= avatarXpThreshold(nextLevel)) {
    nextXp -= avatarXpThreshold(nextLevel);
    nextLevel += 1;
  }
  const [updated] = await db.update(userAvatarProfiles).set({
    level: nextLevel,
    xp: nextXp,
    totalXp: profile.totalXp + coins,
    updatedAt: new Date(),
  }).where(eq(userAvatarProfiles.id, profile.id)).returning();
  return { ok: true, message: "Avatar boosted.", profile: updated };
}

/** Pick the companion profile with highest total XP; tie-break by smallest avatarKey (stable). */
export function selectDominantAvatarProfile(profiles: UserAvatarProfile[]): UserAvatarProfile | null {
  if (profiles.length === 0) return null;
  let best = profiles[0]!;
  for (let i = 1; i < profiles.length; i++) {
    const p = profiles[i]!;
    if (p.totalXp > best.totalXp) best = p;
    else if (p.totalXp === best.totalXp && p.avatarKey.localeCompare(best.avatarKey) < 0) best = p;
  }
  return best;
}

/**
 * Apply flat XP to one avatar row and append a zero-amount coin row for UTC-day cap counting.
 * Caller must enforce caps before invoking.
 */
export async function applyVoiceAvatarXpWithTick(params: {
  userId: string;
  profileId: string;
  xpGain: number;
  tickReason: string;
  tickDetails: string;
}): Promise<{ level: number; xp: number; totalXp: number } | null> {
  const { userId, profileId, xpGain, tickReason, tickDetails } = params;
  if (!Number.isFinite(xpGain) || xpGain <= 0) return null;
  const [profile] = await db.select().from(userAvatarProfiles).where(eq(userAvatarProfiles.id, profileId)).limit(1);
  if (!profile) return null;
  let nextLevel = profile.level;
  let nextXp = profile.xp + xpGain;
  while (nextXp >= avatarXpThreshold(nextLevel)) {
    nextXp -= avatarXpThreshold(nextLevel);
    nextLevel += 1;
  }
  const totalXp = profile.totalXp + xpGain;
  await db
    .update(userAvatarProfiles)
    .set({ level: nextLevel, xp: nextXp, totalXp, updatedAt: new Date() })
    .where(eq(userAvatarProfiles.id, profileId));
  await db.insert(coinTransactions).values({
    id: randomUUID(),
    userId,
    amount: 0,
    reason: tickReason,
    details: tickDetails,
  });
  return { level: nextLevel, xp: nextXp, totalXp };
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
  effectType: string;
  effectPerLevel: number;
}>> {
  await seedOfflineSkillTree();
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
      effectType: node.effectType,
      effectPerLevel: node.effectPerLevel,
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
  maxAttachmentBytes: Number(process.env.STORAGE_MAX_ATTACHMENT_BYTES || 15 * 1024 * 1024 * 1024),
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
    const limitGb = (policy.maxAttachmentBytes / (1024 * 1024 * 1024)).toFixed(1);
    const usedGb = (usage.attachmentBytes / (1024 * 1024 * 1024)).toFixed(2);
    return {
      ok: false,
      message: `Storage limit reached (${usedGb} GB of ${limitGb} GB used). Remove old attachments or contact support.`,
    };
  }
  return { ok: true };
}

export async function createAttachmentAsset(input: {
  userId: string;
  kind?: string;
  taskId?: string;
  fileName?: string;
  mimeType: string;
  byteSize: number;
  metadataJson?: string;
}): Promise<AttachmentAsset> {
  const [asset] = await db.insert(attachmentAssets).values({
    id: randomUUID(),
    userId: input.userId,
    taskId: input.taskId || null,
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

export async function getTaskAttachments(userId: string, taskId: string): Promise<AttachmentAsset[]> {
  return db.select().from(attachmentAssets).where(and(
    eq(attachmentAssets.userId, userId),
    eq(attachmentAssets.taskId, taskId),
    sql`${attachmentAssets.deletedAt} IS NULL`,
  )).orderBy(desc(attachmentAssets.createdAt));
}

/** Batch-fetch attachment asset ids per task (for markdown `attachment:<id>` allowlists on list DTOs). */
export async function getTaskAttachmentIdsForTasks(
  userId: string,
  taskIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (taskIds.length === 0) return map;
  const rows = await db
    .select({ taskId: attachmentAssets.taskId, id: attachmentAssets.id })
    .from(attachmentAssets)
    .where(and(
      eq(attachmentAssets.userId, userId),
      sql`${attachmentAssets.deletedAt} IS NULL`,
      inArray(attachmentAssets.taskId, taskIds),
    ));
  for (const r of rows) {
    if (!r.taskId) continue;
    const list = map.get(r.taskId) ?? [];
    list.push(r.id);
    map.set(r.taskId, list);
  }
  return map;
}

export async function linkAttachmentToTask(userId: string, assetId: string, taskId: string): Promise<AttachmentAsset | undefined> {
  const [asset] = await db
    .update(attachmentAssets)
    .set({ taskId })
    .where(and(eq(attachmentAssets.id, assetId), eq(attachmentAssets.userId, userId)))
    .returning();
  return asset;
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

/**
 * Link up to N owned attachment_assets to a composable owner (collab msg,
 * community post, etc.). Rejects silently when an assetId does not belong to
 * the caller or when it has been soft-deleted. Returns the AttachmentAsset
 * rows that were successfully linked (preserving the caller's order).
 */
export async function linkAttachmentsToOwner(options: {
  userId: string;
  ownerType: MessageAttachmentOwnerType;
  ownerId: string;
  assetIds: string[];
}): Promise<AttachmentAsset[]> {
  if (!MESSAGE_ATTACHMENT_OWNER_TYPES.includes(options.ownerType)) {
    throw new Error(`invalid attachment owner_type: ${options.ownerType}`);
  }
  if (options.assetIds.length === 0) return [];

  const assets: AttachmentAsset[] = [];
  for (let i = 0; i < options.assetIds.length; i += 1) {
    const assetId = options.assetIds[i];
    const existing = await getAttachmentAssetById(options.userId, assetId);
    if (!existing || existing.deletedAt) continue;

    await db.insert(messageAttachments).values({
      ownerType: options.ownerType,
      ownerId: options.ownerId,
      assetId,
      userId: options.userId,
      position: i,
    }).onConflictDoNothing();

    assets.push(existing);
  }
  return assets;
}

/**
 * Fetch AttachmentAsset rows linked to a given owner, scoped to the caller.
 * Used by read endpoints that want to embed `attachments[]` alongside the
 * composed message body.
 */
export async function getAttachmentsForOwner(options: {
  userId: string;
  ownerType: MessageAttachmentOwnerType;
  ownerId: string;
}): Promise<AttachmentAsset[]> {
  const rows = await db
    .select({
      id: attachmentAssets.id,
      userId: attachmentAssets.userId,
      taskId: attachmentAssets.taskId,
      kind: attachmentAssets.kind,
      fileName: attachmentAssets.fileName,
      mimeType: attachmentAssets.mimeType,
      byteSize: attachmentAssets.byteSize,
      storageKey: attachmentAssets.storageKey,
      metadataJson: attachmentAssets.metadataJson,
      createdAt: attachmentAssets.createdAt,
      deletedAt: attachmentAssets.deletedAt,
      position: messageAttachments.position,
    })
    .from(messageAttachments)
    .innerJoin(attachmentAssets, eq(attachmentAssets.id, messageAttachments.assetId))
    .where(and(
      eq(messageAttachments.ownerType, options.ownerType),
      eq(messageAttachments.ownerId, options.ownerId),
      eq(messageAttachments.userId, options.userId),
      sql`${attachmentAssets.deletedAt} IS NULL`,
    ))
    .orderBy(messageAttachments.position);
  return rows.map(({ position: _p, ...rest }) => rest as AttachmentAsset);
}

/**
 * Same as getAttachmentsForOwner but for read endpoints where the viewer is
 * not necessarily the author (e.g. a community post viewed by a different
 * user). Only returns attachments that the *author* (owner) of the message
 * uploaded - cross-user `attachment:<id>` smuggling is blocked because the
 * link row's `user_id` always equals the author.
 */
export async function getAttachmentsForOwnerPublic(options: {
  ownerType: MessageAttachmentOwnerType;
  ownerId: string;
}): Promise<AttachmentAsset[]> {
  const rows = await db
    .select({
      id: attachmentAssets.id,
      userId: attachmentAssets.userId,
      taskId: attachmentAssets.taskId,
      kind: attachmentAssets.kind,
      fileName: attachmentAssets.fileName,
      mimeType: attachmentAssets.mimeType,
      byteSize: attachmentAssets.byteSize,
      storageKey: attachmentAssets.storageKey,
      metadataJson: attachmentAssets.metadataJson,
      createdAt: attachmentAssets.createdAt,
      deletedAt: attachmentAssets.deletedAt,
      position: messageAttachments.position,
    })
    .from(messageAttachments)
    .innerJoin(attachmentAssets, eq(attachmentAssets.id, messageAttachments.assetId))
    .where(and(
      eq(messageAttachments.ownerType, options.ownerType),
      eq(messageAttachments.ownerId, options.ownerId),
      sql`${attachmentAssets.deletedAt} IS NULL`,
    ))
    .orderBy(messageAttachments.position);
  return rows.map(({ position: _p, ...rest }) => rest as AttachmentAsset);
}

/**
 * Batched variant of `getAttachmentsForOwner` for a list of ownerIds under
 * one ownerType. Collapses N separate queries into a single JOIN, returning
 * a Map<ownerId, AttachmentAsset[]>. Ownership (userId) is still enforced
 * so a caller can't fetch someone else's attachments via ID guessing.
 *
 * Introduced to kill the N+1 in GET /api/collaboration/inbox where each
 * inbox row previously triggered its own round trip.
 */
export async function getAttachmentsForOwnersBatch(options: {
  userId: string;
  ownerType: MessageAttachmentOwnerType;
  ownerIds: readonly string[];
}): Promise<Map<string, AttachmentAsset[]>> {
  const result = new Map<string, AttachmentAsset[]>();
  if (options.ownerIds.length === 0) return result;
  const rows = await db
    .select({
      id: attachmentAssets.id,
      userId: attachmentAssets.userId,
      taskId: attachmentAssets.taskId,
      kind: attachmentAssets.kind,
      fileName: attachmentAssets.fileName,
      mimeType: attachmentAssets.mimeType,
      byteSize: attachmentAssets.byteSize,
      storageKey: attachmentAssets.storageKey,
      metadataJson: attachmentAssets.metadataJson,
      createdAt: attachmentAssets.createdAt,
      deletedAt: attachmentAssets.deletedAt,
      ownerId: messageAttachments.ownerId,
      position: messageAttachments.position,
    })
    .from(messageAttachments)
    .innerJoin(attachmentAssets, eq(attachmentAssets.id, messageAttachments.assetId))
    .where(and(
      eq(messageAttachments.userId, options.userId),
      eq(messageAttachments.ownerType, options.ownerType),
      inArray(messageAttachments.ownerId, [...options.ownerIds]),
      sql`${attachmentAssets.deletedAt} IS NULL`,
    ))
    .orderBy(messageAttachments.ownerId, messageAttachments.position);
  for (const row of rows) {
    const { ownerId, position: _p, ...rest } = row;
    const bucket = result.get(ownerId) ?? [];
    bucket.push(rest as AttachmentAsset);
    result.set(ownerId, bucket);
  }
  return result;
}

/**
 * Public/read-side batched variant used by endpoints where the viewer is
 * not necessarily the author (community post + its replies). Does not
 * filter by caller userId — ownership is implied by the link rows' own
 * userId column (author uploads only), same guarantee as
 * getAttachmentsForOwnerPublic.
 */
export async function getAttachmentsForOwnersPublicBatch(options: {
  ownerType: MessageAttachmentOwnerType;
  ownerIds: readonly string[];
}): Promise<Map<string, AttachmentAsset[]>> {
  const result = new Map<string, AttachmentAsset[]>();
  if (options.ownerIds.length === 0) return result;
  const rows = await db
    .select({
      id: attachmentAssets.id,
      userId: attachmentAssets.userId,
      taskId: attachmentAssets.taskId,
      kind: attachmentAssets.kind,
      fileName: attachmentAssets.fileName,
      mimeType: attachmentAssets.mimeType,
      byteSize: attachmentAssets.byteSize,
      storageKey: attachmentAssets.storageKey,
      metadataJson: attachmentAssets.metadataJson,
      createdAt: attachmentAssets.createdAt,
      deletedAt: attachmentAssets.deletedAt,
      ownerId: messageAttachments.ownerId,
      position: messageAttachments.position,
    })
    .from(messageAttachments)
    .innerJoin(attachmentAssets, eq(attachmentAssets.id, messageAttachments.assetId))
    .where(and(
      eq(messageAttachments.ownerType, options.ownerType),
      inArray(messageAttachments.ownerId, [...options.ownerIds]),
      sql`${attachmentAssets.deletedAt} IS NULL`,
    ))
    .orderBy(messageAttachments.ownerId, messageAttachments.position);
  for (const row of rows) {
    const { ownerId, position: _p, ...rest } = row;
    const bucket = result.get(ownerId) ?? [];
    bucket.push(rest as AttachmentAsset);
    result.set(ownerId, bucket);
  }
  return result;
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

// ─── Community Posts Storage ────────────────────────────────────────────────

export async function listCommunityPosts(limit = 30): Promise<CommunityPost[]> {
  return db
    .select()
    .from(communityPosts)
    .orderBy(desc(communityPosts.createdAt))
    .limit(limit);
}

export async function createCommunityPost(post: {
  avatarKey: string;
  avatarName: string;
  title: string;
  body: string;
  category?: string;
  relatedTaskId?: string | null;
}): Promise<CommunityPost> {
  const [row] = await db
    .insert(communityPosts)
    .values({
      id: randomUUID(),
      avatarKey: post.avatarKey,
      avatarName: post.avatarName,
      title: post.title,
      body: post.body,
      category: post.category || "general",
      relatedTaskId: post.relatedTaskId || null,
    })
    .returning();
  return row;
}

export async function getCommunityPostWithReplies(postId: string): Promise<{
  post: CommunityPost;
  replies: CommunityReply[];
} | null> {
  const [post] = await db
    .select()
    .from(communityPosts)
    .where(eq(communityPosts.id, postId));
  if (!post) return null;
  const replies = await db
    .select()
    .from(communityReplies)
    .where(eq(communityReplies.postId, postId))
    .orderBy(asc(communityReplies.createdAt));
  return { post, replies };
}

export async function createCommunityReply(reply: {
  postId: string;
  userId?: string | null;
  avatarKey?: string | null;
  displayName: string;
  body: string;
}): Promise<CommunityReply> {
  const [row] = await db
    .insert(communityReplies)
    .values({
      id: randomUUID(),
      postId: reply.postId,
      userId: reply.userId || null,
      avatarKey: reply.avatarKey || null,
      displayName: reply.displayName,
      body: reply.body,
    })
    .returning();
  return row;
}

/**
 * Seed the community with avatar-generated posts if the table is empty.
 * These are "tangentially relevant" prompts that feel like banter between
 * the avatar engines — users can then join the conversation.
 */
const AVATAR_SEED_POSTS: Array<{
  avatarKey: string;
  avatarName: string;
  title: string;
  body: string;
  category: string;
}> = [
  {
    avatarKey: "mood",
    avatarName: "Moodweaver",
    title: "Does anyone else re-prioritize their entire day after a good cup of coffee?",
    body: "I noticed that emotional momentum is real. One small win in the morning cascades into a surprisingly productive afternoon. The trick is noticing which tasks *feel* right first thing — not which ones look urgent on paper. What's your morning anchor task?",
    category: "productivity",
  },
  {
    avatarKey: "archetype",
    avatarName: "Archon",
    title: "The hidden cost of task-switching: a pattern I keep seeing",
    body: "Across thousands of task logs I've noticed something interesting — people who batch similar tasks together complete 30% more by end of day. But the *type* of batching matters. It's not about category; it's about cognitive mode. Writing tasks together, admin tasks together, creative bursts together. Anyone else found their own batching sweet spot?",
    category: "insights",
  },
  {
    avatarKey: "productivity",
    avatarName: "Cadence",
    title: "Confession: I think most 'high priority' tasks aren't actually urgent",
    body: "Hot take from the productivity engine: marking everything as high priority is the same as marking nothing. The real skill is being honest about what can wait a day. I've started asking myself — if I didn't do this today, what actually breaks? Usually the answer is: nothing. That clarity helps me focus on what genuinely matters.",
    category: "discussion",
  },
  {
    avatarKey: "social",
    avatarName: "Nexus",
    title: "What's the weirdest task you've ever tracked?",
    body: "I love seeing the creative ways people use task managers. Grocery runs, existential crises, 'remind me to breathe' — it all counts. There's something beautiful about treating the mundane with the same respect as the monumental. Drop your most unusual task below. No judgement zone! 🎭",
    category: "fun",
  },
  {
    avatarKey: "lazy",
    avatarName: "Drift",
    title: "In praise of doing less: why your unfinished list is actually fine",
    body: "Hey. Drift here. I know the other engines love to talk about crushing it, but can we appreciate the art of *not* finishing everything? An incomplete list means you were ambitious enough to dream big. Rest isn't failure. Sometimes the most productive thing is closing the laptop and going for a walk. Tomorrow-you will have fresh eyes. 🌿",
    category: "wellness",
  },
  {
    avatarKey: "mood",
    avatarName: "Moodweaver",
    title: "The 3PM slump is real — here's what I've been experimenting with",
    body: "That mid-afternoon energy crash isn't just you. I've been tracking mood-vs-task-completion patterns and the data is clear: creative work before 2pm, mechanical work after. But what REALLY helps is a 10-minute palate cleanser — something completely different. A quick sketch, a walk, even reorganizing your desk. Then dive back in. What's your 3PM hack?",
    category: "productivity",
  },
];

export async function seedCommunityPosts(): Promise<void> {
  const [existing] = await db.select({ value: count() }).from(communityPosts);
  if ((Number(existing?.value) || 0) > 0) return;
  for (const post of AVATAR_SEED_POSTS) {
    await createCommunityPost(post);
  }
}

// ─── Archetype polls (community) ─────────────────────────────────────────────

export async function hasArchetypePollActiveOrFuture(now: Date): Promise<boolean> {
  const [row] = await db
    .select({ c: count() })
    .from(archetypePolls)
    .where(gt(archetypePolls.closesAt, now));
  return Number(row?.c ?? 0) > 0;
}

export async function listArchetypePollsForPublic(now: Date, limit = 20): Promise<ArchetypePoll[]> {
  return db
    .select()
    .from(archetypePolls)
    .where(lte(archetypePolls.opensAt, now))
    .orderBy(desc(archetypePolls.closesAt))
    .limit(limit);
}

export async function getArchetypePollById(pollId: string): Promise<ArchetypePoll | null> {
  const [row] = await db.select().from(archetypePolls).where(eq(archetypePolls.id, pollId));
  return row ?? null;
}

export async function listArchetypePollOptions(pollId: string): Promise<ArchetypePollOption[]> {
  return db
    .select()
    .from(archetypePollOptions)
    .where(eq(archetypePollOptions.pollId, pollId))
    .orderBy(asc(archetypePollOptions.sortOrder), asc(archetypePollOptions.id));
}

export async function getArchetypePollKAnonTalliesForPublic(pollId: string) {
  const options = await listArchetypePollOptions(pollId);
  if (options.length === 0) return [];
  const tallyRows = await db
    .select({
      optionId: archetypePollVotes.optionId,
      archetypeKey: archetypePollVotes.archetypeKey,
      n: count(),
    })
    .from(archetypePollVotes)
    .where(eq(archetypePollVotes.pollId, pollId))
    .groupBy(archetypePollVotes.optionId, archetypePollVotes.archetypeKey);

  const raw: RawOptionTally[] = options.map((opt) => {
    const countsByArchetype = new Map<string, number>();
    let totalCount = 0;
    for (const row of tallyRows) {
      if (row.optionId !== opt.id) continue;
      const v = Number(row.n);
      countsByArchetype.set(row.archetypeKey, v);
      totalCount += v;
    }
    return {
      optionId: opt.id,
      label: opt.label,
      sortOrder: opt.sortOrder,
      countsByArchetype,
      totalCount,
    };
  });
  return applyKAnonymityToPollTallies(raw);
}

export async function getArchetypePollVoteForUser(
  pollId: string,
  userId: string,
): Promise<ArchetypePollVote | null> {
  const [row] = await db
    .select()
    .from(archetypePollVotes)
    .where(and(eq(archetypePollVotes.pollId, pollId), eq(archetypePollVotes.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function upsertArchetypePollVote(input: {
  userId: string;
  pollId: string;
  optionId: string;
  archetypeKey: string;
}): Promise<ArchetypePollVote> {
  const existing = await getArchetypePollVoteForUser(input.pollId, input.userId);
  if (existing) {
    const [updated] = await db
      .update(archetypePollVotes)
      .set({
        optionId: input.optionId,
        archetypeKey: input.archetypeKey,
      })
      .where(eq(archetypePollVotes.id, existing.id))
      .returning();
    return updated;
  }
  const [row] = await db
    .insert(archetypePollVotes)
    .values({
      id: randomUUID(),
      pollId: input.pollId,
      userId: input.userId,
      optionId: input.optionId,
      archetypeKey: input.archetypeKey,
    })
    .returning();
  return row;
}

const POLL_VOTE_ROLLING_MS = 7 * 24 * 60 * 60 * 1000;
const PG_SERIALIZATION_FAILURE = "40001";

/**
 * Records a poll vote and optionally credits the weekly archetype-poll reward inside one
 * serializable transaction (retries on serialization failure). The reward uses a **global**
 * rolling 7-day cap for `rewardReason` (not per poll): at most `weeklyCap` coin rows in that window.
 */
export async function recordArchetypePollVoteWithWeeklyReward(params: {
  userId: string;
  pollId: string;
  optionId: string;
  archetypeKey: string;
  rewardAmount: number;
  weeklyCap: number;
  rewardReason: string;
  rewardDetails: string;
}): Promise<{
  vote: ArchetypePollVote;
  isNewVote: boolean;
  pollVoteReward: { coins: number; newBalance: number } | null;
  pollVoteRewardNote: "weekly_cap" | null;
}> {
  const run = () =>
    db.transaction(
      async (tx) => {
        const existing = await tx
          .select()
          .from(archetypePollVotes)
          .where(
            and(
              eq(archetypePollVotes.pollId, params.pollId),
              eq(archetypePollVotes.userId, params.userId),
            ),
          )
          .limit(1);
        const row0 = existing[0];
        let vote: ArchetypePollVote;
        let isNewVote: boolean;

        if (row0) {
          const [updated] = await tx
            .update(archetypePollVotes)
            .set({
              optionId: params.optionId,
              archetypeKey: params.archetypeKey,
            })
            .where(eq(archetypePollVotes.id, row0.id))
            .returning();
          vote = updated;
          isNewVote = false;
        } else {
          const [row] = await tx
            .insert(archetypePollVotes)
            .values({
              id: randomUUID(),
              pollId: params.pollId,
              userId: params.userId,
              optionId: params.optionId,
              archetypeKey: params.archetypeKey,
            })
            .returning();
          vote = row;
          isNewVote = true;
        }

        const weekAgo = new Date(Date.now() - POLL_VOTE_ROLLING_MS);
        const [cntRow] = await tx
          .select({ value: count() })
          .from(coinTransactions)
          .where(
            and(
              eq(coinTransactions.userId, params.userId),
              eq(coinTransactions.reason, params.rewardReason),
              gte(coinTransactions.createdAt, weekAgo),
            ),
          );
        const prior = Number(cntRow?.value) || 0;
        if (prior >= params.weeklyCap) {
          return {
            vote,
            isNewVote,
            pollVoteReward: null,
            pollVoteRewardNote: "weekly_cap" as const,
          };
        }

        const [walletRow] = await tx.select().from(wallets).where(eq(wallets.userId, params.userId));
        if (!walletRow) {
          await tx.insert(wallets).values({ userId: params.userId });
        }

        const [updatedWallet] = await tx
          .update(wallets)
          .set({
            balance: sql`${wallets.balance} + ${params.rewardAmount}`,
            lifetimeEarned: sql`${wallets.lifetimeEarned} + ${params.rewardAmount}`,
          })
          .where(eq(wallets.userId, params.userId))
          .returning();

        await tx.insert(coinTransactions).values({
          id: randomUUID(),
          userId: params.userId,
          amount: params.rewardAmount,
          reason: params.rewardReason,
          details: params.rewardDetails,
        });

        return {
          vote,
          isNewVote,
          pollVoteReward: {
            coins: params.rewardAmount,
            newBalance: updatedWallet!.balance,
          },
          pollVoteRewardNote: null,
        };
      },
      { isolationLevel: "serializable" },
    );

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await run();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === PG_SERIALIZATION_FAILURE && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error("recordArchetypePollVoteWithWeeklyReward: serialization retries exhausted");
}

export async function createArchetypePollWithOptions(input: {
  title: string;
  body?: string | null;
  authorAvatarKey: string;
  opensAt: Date;
  closesAt: Date;
  options: { label: string; sortOrder: number }[];
}): Promise<{ poll: ArchetypePoll; options: ArchetypePollOption[] }> {
  const now = new Date();
  const status =
    now < input.opensAt ? "scheduled" : now >= input.closesAt ? "closed" : "open";
  return db.transaction(async (tx) => {
    const [poll] = await tx
      .insert(archetypePolls)
      .values({
        id: randomUUID(),
        title: input.title,
        body: input.body ?? null,
        status,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        authorAvatarKey: input.authorAvatarKey,
      })
      .returning();
    const outOpts: ArchetypePollOption[] = [];
    for (const o of input.options) {
      const [opt] = await tx
        .insert(archetypePollOptions)
        .values({
          id: randomUUID(),
          pollId: poll.id,
          label: o.label,
          sortOrder: o.sortOrder,
        })
        .returning();
      outOpts.push(opt);
    }
    return { poll, options: outOpts };
  });
}

// ─── Collaboration helpers ──────────────────────────────────────────────────

export async function addCollaborator(
  taskId: string,
  userId: string,
  role: string,
  invitedBy: string
): Promise<TaskCollaborator> {
  const existing = await db
    .select()
    .from(taskCollaborators)
    .where(and(eq(taskCollaborators.taskId, taskId), eq(taskCollaborators.userId, userId)));
  if (existing.length > 0) {
    const [updated] = await db
      .update(taskCollaborators)
      .set({ role })
      .where(eq(taskCollaborators.id, existing[0].id))
      .returning();
    return updated;
  }
  const [collab] = await db
    .insert(taskCollaborators)
    .values({ id: randomUUID(), taskId, userId, role, invitedBy })
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

export async function getTaskCollaborators(taskId: string): Promise<(TaskCollaborator & { displayName: string | null; publicHandle: string })[]> {
  const rows = await db
    .select({
      id: taskCollaborators.id,
      taskId: taskCollaborators.taskId,
      userId: taskCollaborators.userId,
      role: taskCollaborators.role,
      invitedBy: taskCollaborators.invitedBy,
      invitedAt: taskCollaborators.invitedAt,
      displayName: users.displayName,
      publicHandle: users.publicHandle,
    })
    .from(taskCollaborators)
    .innerJoin(users, eq(taskCollaborators.userId, users.id))
    .where(eq(taskCollaborators.taskId, taskId));
  return rows;
}

export async function updateCollaboratorRole(taskId: string, userId: string, role: string): Promise<TaskCollaborator | null> {
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
  const result = await db.select().from(tasks).where(
    or(...taskIds.map(id => eq(tasks.id, id)))
  );
  return result;
}

export type TaskViewerRole = "owner" | "editor" | "viewer";
export type AccessibleTask = { task: Task; viewerRole: TaskViewerRole };

function toViewerRole(role: string | null | undefined): TaskViewerRole {
  return role === "editor" ? "editor" : "viewer";
}

export async function getAccessibleTasksForUser(userId: string): Promise<AccessibleTask[]> {
  const ownedTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.sortOrder));

  const sharedMemberships = await db
    .select({
      taskId: taskCollaborators.taskId,
      role: taskCollaborators.role,
    })
    .from(taskCollaborators)
    .where(eq(taskCollaborators.userId, userId));

  if (sharedMemberships.length === 0) {
    return ownedTasks.map((task) => ({ task, viewerRole: "owner" as const }));
  }

  const ownedTaskIds = new Set(ownedTasks.map((task) => task.id));
  const sharedTaskIds = sharedMemberships
    .map((row) => row.taskId)
    .filter((taskId) => !ownedTaskIds.has(taskId));

  const sharedTasks = sharedTaskIds.length > 0
    ? await db
      .select()
      .from(tasks)
      .where(inArray(tasks.id, sharedTaskIds))
      .orderBy(asc(tasks.sortOrder))
    : [];

  const roleByTaskId = new Map(sharedMemberships.map((row) => [row.taskId, toViewerRole(row.role)]));
  const owned = ownedTasks.map((task) => ({ task, viewerRole: "owner" as const }));
  const shared = sharedTasks.map((task) => ({
    task,
    viewerRole: roleByTaskId.get(task.id) ?? "viewer",
  }));
  return [...owned, ...shared].sort((a, b) => Number(a.task.sortOrder ?? 0) - Number(b.task.sortOrder ?? 0));
}

export async function getAccessibleTaskForUser(userId: string, taskId: string): Promise<AccessibleTask | null> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return null;
  if (task.userId === userId) return { task, viewerRole: "owner" };

  const [membership] = await db
    .select({ role: taskCollaborators.role })
    .from(taskCollaborators)
    .where(and(eq(taskCollaborators.taskId, taskId), eq(taskCollaborators.userId, userId)));
  if (!membership) return null;
  return { task, viewerRole: toViewerRole(membership.role) };
}

export async function updateTaskById(updateTask: UpdateTask): Promise<Task | undefined> {
  const [task] = await db
    .update(tasks)
    .set({ ...updateTask, updatedAt: new Date() })
    .where(eq(tasks.id, updateTask.id))
    .returning();
  return task || undefined;
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

// ─── Pattern Learning Storage ────────────────────────────────────────────────

export async function upsertPattern(
  userId: string,
  patternType: string,
  patternKey: string,
  data: Record<string, unknown>,
  confidence: number
): Promise<TaskPattern> {
  const now = new Date();
  const dataStr = JSON.stringify(data);

  const result = await db.execute(sql`
    INSERT INTO task_patterns (id, user_id, pattern_type, pattern_key, data, confidence, occurrences, last_seen, created_at)
    VALUES (${randomUUID()}, ${userId}, ${patternType}, ${patternKey}, ${dataStr}, ${confidence}, 1, ${now}, ${now})
    ON CONFLICT (user_id, pattern_type, pattern_key)
    DO UPDATE SET
      data = ${dataStr},
      confidence = ${confidence},
      occurrences = task_patterns.occurrences + 1,
      last_seen = ${now}
    RETURNING *
  `);

  return result.rows[0] as unknown as TaskPattern;
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
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(taskPatterns)
    .where(and(eq(taskPatterns.userId, userId), lt(taskPatterns.lastSeen, cutoff)))
    .returning();
  return result.length;
}

export async function clearPatterns(userId: string): Promise<void> {
  await db.delete(taskPatterns).where(eq(taskPatterns.userId, userId));
}

// ─── Classification Contributions ──────────────────────────────────────────

export async function createClassificationContribution(
  taskId: string,
  userId: string,
  classification: string,
  baseCoinsAwarded: number
): Promise<ClassificationContribution> {
  const [existing] = await db
    .select()
    .from(classificationContributions)
    .where(and(
      eq(classificationContributions.taskId, taskId),
      eq(classificationContributions.userId, userId)
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(classificationContributions)
      .set({
        classification,
        baseCoinsAwarded,
      })
      .where(eq(classificationContributions.id, existing.id))
      .returning();
    return updated;
  }

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
  return contrib;
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
): Promise<ClassificationConfirmation> {
  const [confirmation] = await db
    .insert(classificationConfirmations)
    .values({
      id: randomUUID(),
      contributionId,
      taskId,
      userId: confirmingUserId,
      coinsAwarded,
    })
    .returning();

  return confirmation;
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

export async function getUserClassificationStats(userId: string): Promise<{
  totalClassifications: number;
  totalConfirmationsReceived: number;
  totalClassificationCoins: number;
}> {
  const [classRow] = await db
    .select({
      total: count(),
      totalCoins: sql<number>`COALESCE(SUM(${classificationContributions.totalCoinsEarned}), 0)`,
      totalConfirmations: sql<number>`COALESCE(SUM(${classificationContributions.confirmationCount}), 0)`,
    })
    .from(classificationContributions)
    .where(eq(classificationContributions.userId, userId));

  return {
    totalClassifications: Number(classRow?.total) || 0,
    totalConfirmationsReceived: Number(classRow?.totalConfirmations) || 0,
    totalClassificationCoins: Number(classRow?.totalCoins) || 0,
  };
}

// ─── Classification Disputes ───────────────────────────────────────────────
// Peer-challenge path complementing the economic-consensus confirmations above.
// Disputes do not touch wallets or coins in this PR (see the plan's "Coin economy
// neutrality" section and docs/OPERATOR_COIN_GRANTS.md). Tracker thresholds are
// baseline-compatible: >=5 disputes with >=70% agreement => review_needed;
// >=5 disputes with <70% => contested; otherwise monitoring.

const DISPUTE_REVIEW_MIN_DISPUTES = 5;
const DISPUTE_REVIEW_AGREEMENT_RATIO = 0.7;

export interface DisputeWithVoteTally extends ClassificationDispute {
  displayName: string | null;
  agreeCount: number;
  disagreeCount: number;
  totalVotes: number;
}

export async function createDispute(
  taskId: string,
  userId: string,
  originalCategory: string,
  suggestedCategory: string,
  reason: string | null,
): Promise<ClassificationDispute> {
  const [row] = await db
    .insert(classificationDisputes)
    .values({
      id: randomUUID(),
      taskId,
      userId,
      originalCategory,
      suggestedCategory,
      reason,
    })
    .returning();
  return row;
}

export async function getUserDispute(
  taskId: string,
  userId: string,
): Promise<ClassificationDispute | null> {
  const [row] = await db
    .select()
    .from(classificationDisputes)
    .where(and(
      eq(classificationDisputes.taskId, taskId),
      eq(classificationDisputes.userId, userId),
    ))
    .limit(1);
  return row || null;
}

export async function getDisputeById(disputeId: string): Promise<ClassificationDispute | null> {
  const [row] = await db
    .select()
    .from(classificationDisputes)
    .where(eq(classificationDisputes.id, disputeId))
    .limit(1);
  return row || null;
}

export async function getDisputesForTask(taskId: string): Promise<DisputeWithVoteTally[]> {
  const rows = await db
    .select({
      id: classificationDisputes.id,
      taskId: classificationDisputes.taskId,
      userId: classificationDisputes.userId,
      originalCategory: classificationDisputes.originalCategory,
      suggestedCategory: classificationDisputes.suggestedCategory,
      reason: classificationDisputes.reason,
      createdAt: classificationDisputes.createdAt,
      displayName: users.displayName,
    })
    .from(classificationDisputes)
    .innerJoin(users, eq(users.id, classificationDisputes.userId))
    .where(eq(classificationDisputes.taskId, taskId))
    .orderBy(desc(classificationDisputes.createdAt));

  const tallies = await Promise.all(rows.map((r) => getVoteTallyForDispute(r.id)));
  return rows.map((r, i) => ({ ...r, ...tallies[i] }));
}

export async function getDisputesByCategory(
  originalCategory: string,
  limit = 50,
): Promise<ClassificationDispute[]> {
  return db
    .select()
    .from(classificationDisputes)
    .where(eq(classificationDisputes.originalCategory, originalCategory))
    .orderBy(desc(classificationDisputes.createdAt))
    .limit(limit);
}

export async function getVoteTallyForDispute(disputeId: string): Promise<{
  agreeCount: number;
  disagreeCount: number;
  totalVotes: number;
}> {
  const [row] = await db
    .select({
      agreeCount: sql<number>`COALESCE(SUM(CASE WHEN ${classificationDisputeVotes.agree} THEN 1 ELSE 0 END), 0)`,
      totalVotes: count(),
    })
    .from(classificationDisputeVotes)
    .where(eq(classificationDisputeVotes.disputeId, disputeId));

  const agreeCount = Number(row?.agreeCount) || 0;
  const totalVotes = Number(row?.totalVotes) || 0;
  return { agreeCount, disagreeCount: totalVotes - agreeCount, totalVotes };
}

export async function getUserVoteOnDispute(
  disputeId: string,
  userId: string,
): Promise<ClassificationDisputeVote | null> {
  const [row] = await db
    .select()
    .from(classificationDisputeVotes)
    .where(and(
      eq(classificationDisputeVotes.disputeId, disputeId),
      eq(classificationDisputeVotes.userId, userId),
    ))
    .limit(1);
  return row || null;
}

export async function voteOnDispute(
  disputeId: string,
  userId: string,
  agree: boolean,
): Promise<ClassificationDisputeVote> {
  const existing = await getUserVoteOnDispute(disputeId, userId);
  if (existing) {
    const [updated] = await db
      .update(classificationDisputeVotes)
      .set({ agree, updatedAt: new Date() })
      .where(eq(classificationDisputeVotes.id, existing.id))
      .returning();
    return updated;
  }
  const [row] = await db
    .insert(classificationDisputeVotes)
    .values({
      id: randomUUID(),
      disputeId,
      userId,
      agree,
    })
    .returning();
  return row;
}

export async function updateCategoryReviewTracker(
  originalCategory: string,
  suggestedCategory: string,
): Promise<CategoryReviewTrigger> {
  const [disputeAgg] = await db
    .select({
      disputeCount: count(),
    })
    .from(classificationDisputes)
    .where(and(
      eq(classificationDisputes.originalCategory, originalCategory),
      eq(classificationDisputes.suggestedCategory, suggestedCategory),
    ));

  const disputeCount = Number(disputeAgg?.disputeCount) || 0;

  const [voteAgg] = await db
    .select({
      agreeCount: sql<number>`COALESCE(SUM(CASE WHEN ${classificationDisputeVotes.agree} THEN 1 ELSE 0 END), 0)`,
      totalVotes: count(),
    })
    .from(classificationDisputeVotes)
    .innerJoin(
      classificationDisputes,
      eq(classificationDisputes.id, classificationDisputeVotes.disputeId),
    )
    .where(and(
      eq(classificationDisputes.originalCategory, originalCategory),
      eq(classificationDisputes.suggestedCategory, suggestedCategory),
    ));

  const agreeCount = Number(voteAgg?.agreeCount) || 0;
  const totalVotes = Number(voteAgg?.totalVotes) || 0;
  const consensusRatio = totalVotes > 0 ? agreeCount / totalVotes : 0;

  let status: CategoryReviewStatus;
  if (disputeCount >= DISPUTE_REVIEW_MIN_DISPUTES && consensusRatio >= DISPUTE_REVIEW_AGREEMENT_RATIO) {
    status = "review_needed";
  } else if (disputeCount >= DISPUTE_REVIEW_MIN_DISPUTES) {
    status = "contested";
  } else {
    status = "monitoring";
  }

  const [existing] = await db
    .select()
    .from(categoryReviewTriggers)
    .where(and(
      eq(categoryReviewTriggers.originalCategory, originalCategory),
      eq(categoryReviewTriggers.suggestedCategory, suggestedCategory),
    ))
    .limit(1);

  if (existing) {
    // Never regress a resolved trigger back to monitoring/contested without
    // an explicit resolveCategoryReview(id, ...) call clearing the outcome.
    const nextStatus = existing.status === "resolved" ? existing.status as CategoryReviewStatus : status;
    const [updated] = await db
      .update(categoryReviewTriggers)
      .set({
        disputeCount,
        agreeCount,
        totalVotes,
        consensusRatio,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(categoryReviewTriggers.id, existing.id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(categoryReviewTriggers)
    .values({
      id: randomUUID(),
      originalCategory,
      suggestedCategory,
      disputeCount,
      agreeCount,
      totalVotes,
      consensusRatio,
      status,
    })
    .returning();
  return inserted;
}

export async function getCategoryReviewTriggers(
  filter?: { status?: CategoryReviewStatus },
): Promise<CategoryReviewTrigger[]> {
  const q = db.select().from(categoryReviewTriggers);
  const rows = filter?.status
    ? await q.where(eq(categoryReviewTriggers.status, filter.status)).orderBy(desc(categoryReviewTriggers.updatedAt))
    : await q.orderBy(desc(categoryReviewTriggers.updatedAt));
  return rows;
}

export async function getCategoryReviewTriggerById(id: string): Promise<CategoryReviewTrigger | null> {
  const [row] = await db
    .select()
    .from(categoryReviewTriggers)
    .where(eq(categoryReviewTriggers.id, id))
    .limit(1);
  return row || null;
}

export async function resolveCategoryReview(
  id: string,
  resolvedBy: string,
  outcome: string,
): Promise<CategoryReviewTrigger | null> {
  const [row] = await db
    .update(categoryReviewTriggers)
    .set({
      status: "resolved",
      resolvedBy,
      resolveOutcome: outcome,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(categoryReviewTriggers.id, id))
    .returning();
  return row || null;
}