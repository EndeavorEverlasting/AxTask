// Core identity + auth + platform-wide preferences.
//
// Domain boundary: anything keyed primarily by `userId` that has no
// dependency on a concrete app feature (tasks, gamification, attachments).
// That includes user accounts, password reset, security audit ledger,
// notifications / push / voice preferences, and adherence state.
//
// Do NOT import from "./tasks", "./gamification", or "./ops" here. Those
// files all depend on `users` from this file; reversing the edge would
// introduce a module cycle.

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique("users_email_unique"),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  role: text("role").notNull().default("user"),
  authProvider: text("auth_provider").notNull().default("local"),
  workosId: text("workos_id"),
  googleId: text("google_id"),
  replitId: text("replit_id"),
  profileImageUrl: text("profile_image_url"),
  securityQuestion: text("security_question"),
  securityAnswerHash: text("security_answer_hash"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  isBanned: boolean("is_banned").notNull().default(false),
  banReason: text("ban_reason"),
  bannedAt: timestamp("banned_at"),
  bannedBy: varchar("banned_by"),
  /** E.164 (+15551234567). Omitted from SafeUser; use phoneMasked in API responses. */
  phoneE164: text("phone_e164"),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  /** AES-GCM payload (iv+ciphertext) for RFC 6238 TOTP shared secret; never exposed in SafeUser. */
  totpSecretCiphertext: text("totp_secret_ciphertext"),
  totpEnabledAt: timestamp("totp_enabled_at"),
  /** Optional calendar date `YYYY-MM-DD` for in-app milestones; not in SafeUser — use GET /api/account/profile. */
  birthDate: text("birth_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Password Reset Tokens ───────────────────────────────────────────────────
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  method: text("method").notNull().default("email"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Security Audit Logs ─────────────────────────────────────────────────────
export const securityLogs = pgTable("security_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(),
  userId: varchar("user_id"),
  targetUserId: varchar("target_user_id"),
  ipAddress: text("ip_address"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_security_logs_event_type").on(table.eventType),
  index("idx_security_logs_user_id").on(table.userId),
  index("idx_security_logs_created_at").on(table.createdAt),
]);

// ─── Security Event Ledger (tamper-evident) ─────────────────────────────────
export const securityEvents = pgTable("security_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  targetUserId: varchar("target_user_id"),
  route: text("route"),
  method: text("method"),
  statusCode: integer("status_code"),
  ipAddress: text("ip_address"),
  userAgentHash: text("user_agent_hash"),
  payloadJson: text("payload_json"),
  prevHash: text("prev_hash"),
  eventHash: text("event_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_security_events_type").on(table.eventType),
  index("idx_security_events_actor").on(table.actorUserId),
  index("idx_security_events_created_at").on(table.createdAt),
  uniqueIndex("ux_security_events_event_hash").on(table.eventHash),
]);

export type SecurityEvent = typeof securityEvents.$inferSelect;

export const securityAlerts = pgTable("security_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleId: text("rule_id").notNull(),
  severity: text("severity").notNull().default("medium"),
  message: text("message").notNull(),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  detailsJson: text("details_json"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_security_alerts_rule").on(table.ruleId),
  index("idx_security_alerts_status").on(table.status),
  index("idx_security_alerts_created_at").on(table.createdAt),
]);

export type SecurityAlert = typeof securityAlerts.$inferSelect;

// Strong password: ≥8 chars, uppercase, lowercase, digit, special character
const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character (!@#$%…)");

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: strongPassword,
  displayName: z.string().optional(),
  inviteCode: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type User = typeof users.$inferSelect;
export type SafeUser = Omit<
  User,
  | "passwordHash"
  | "securityAnswerHash"
  | "failedLoginAttempts"
  | "lockedUntil"
  | "workosId"
  | "googleId"
  | "replitId"
  | "phoneE164"
  | "totpSecretCiphertext"
  | "totpEnabledAt"
  | "birthDate"
> & {
  phoneMasked: string | null;
  phoneVerified: boolean;
  totpEnabled: boolean;
};
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type SecurityLog = typeof securityLogs.$inferSelect;

// ─── Notification Preferences + Push Subscriptions ──────────────────────────
/**
 * Per-avatar feedback nudge slider preferences. `master` is the 0..100 master
 * frequency slider; `byAvatar` holds per-avatar multipliers (0..100). When a
 * per-avatar value is absent it inherits `master` as-is.
 *
 * See `shared/feedback-avatar-map.ts` and `docs/FEEDBACK_AVATAR_NUDGES.md`.
 */
export type FeedbackNudgePrefs = {
  master: number;
  byAvatar: Partial<Record<"archetype" | "productivity" | "mood" | "social" | "lazy", number>>;
};

export const DEFAULT_FEEDBACK_NUDGE_PREFS: FeedbackNudgePrefs = {
  master: 50,
  byAvatar: {},
};

export const userNotificationPreferences = pgTable("user_notification_preferences", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  intensity: integer("intensity").notNull().default(50),
  quietHoursStart: integer("quiet_hours_start"),
  quietHoursEnd: integer("quiet_hours_end"),
  feedbackNudgePrefs: jsonb("feedback_nudge_prefs")
    .$type<FeedbackNudgePrefs>()
    .default(DEFAULT_FEEDBACK_NUDGE_PREFS),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userPushSubscriptions = pgTable("user_push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  expirationTime: integer("expiration_time"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  lastSentAt: timestamp("last_sent_at"),
}, (table) => [
  uniqueIndex("ux_user_push_subscriptions_endpoint").on(table.endpoint),
  index("idx_user_push_subscriptions_user").on(table.userId),
]);

export const feedbackAvatarKeySchema = z.enum([
  "archetype",
  "productivity",
  "mood",
  "social",
  "lazy",
]);

const feedbackSliderSchema = z.number().int().min(0).max(100);

const feedbackByAvatarSchema = z
  .object({
    archetype: feedbackSliderSchema.optional(),
    productivity: feedbackSliderSchema.optional(),
    mood: feedbackSliderSchema.optional(),
    social: feedbackSliderSchema.optional(),
    lazy: feedbackSliderSchema.optional(),
  })
  .strict();

export const feedbackNudgePrefsSchema = z.object({
  master: feedbackSliderSchema,
  byAvatar: feedbackByAvatarSchema,
});

export const updateNotificationPreferenceSchema = z.object({
  enabled: z.boolean().optional(),
  intensity: z.number().int().min(0).max(100).optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  feedbackNudgePrefs: feedbackNudgePrefsSchema.partial().optional(),
});

export const createPushSubscriptionSchema = z.object({
  endpoint: z.string().url("Subscription endpoint must be a valid URL"),
  expirationTime: z.number().int().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1, "Subscription key p256dh is required"),
    auth: z.string().min(1, "Subscription key auth is required"),
  }),
  userAgent: z.string().max(512).optional(),
});

export const deletePushSubscriptionSchema = z.object({
  endpoint: z.string().url("Subscription endpoint must be a valid URL"),
});

export type UserNotificationPreference = typeof userNotificationPreferences.$inferSelect;
export type UserPushSubscription = typeof userPushSubscriptions.$inferSelect;

/** How the app uses the microphone for global voice commands (synced per account). */
export const voiceListeningModeSchema = z.enum(["manual", "wake_after_first_use"]);
export type VoiceListeningMode = z.infer<typeof voiceListeningModeSchema>;

export const userVoicePreferences = pgTable("user_voice_preferences", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  listeningMode: text("listening_mode").notNull().default("wake_after_first_use"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const updateVoicePreferenceSchema = z.object({
  listeningMode: voiceListeningModeSchema.optional(),
});

export type UserVoicePreference = typeof userVoicePreferences.$inferSelect;

export const adherenceSignalSchema = z.enum([
  "missed_due_dates",
  "reminder_ignored",
  "streak_drop",
  "no_engagement",
]);

export const adherenceInterventionStatusSchema = z.enum([
  "open",
  "acknowledged",
  "dismissed",
]);

export const userAdherenceState = pgTable("user_adherence_state", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  lastEvaluatedAt: timestamp("last_evaluated_at"),
  lastLoginAt: timestamp("last_login_at"),
  lastTaskMutationAt: timestamp("last_task_mutation_at"),
  lastMissedDueAt: timestamp("last_missed_due_at"),
  lastReminderIgnoredAt: timestamp("last_reminder_ignored_at"),
  lastStreakDropAt: timestamp("last_streak_drop_at"),
  lastNoEngagementAt: timestamp("last_no_engagement_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_adherence_state_updated").on(table.updatedAt),
]);

export const userAdherenceInterventions = pgTable("user_adherence_interventions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  signal: text("signal").notNull(),
  status: text("status").notNull().default("open"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  channel: text("channel").notNull().default("in_app"),
  contextJson: text("context_json"),
  dedupeKey: text("dedupe_key").notNull(),
  pushSentAt: timestamp("push_sent_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_adherence_interventions_user_status").on(table.userId, table.status),
  index("idx_adherence_interventions_signal").on(table.signal),
  index("idx_adherence_interventions_created").on(table.createdAt),
  uniqueIndex("ux_adherence_interventions_user_dedupe").on(table.userId, table.dedupeKey),
]);

export const acknowledgeAdherenceInterventionSchema = z.object({
  action: z.enum(["acknowledge", "dismiss"]).default("acknowledge"),
});

export type AdherenceSignal = z.infer<typeof adherenceSignalSchema>;
export type AdherenceInterventionStatus = z.infer<typeof adherenceInterventionStatusSchema>;
export type UserAdherenceState = typeof userAdherenceState.$inferSelect;
export type UserAdherenceIntervention = typeof userAdherenceInterventions.$inferSelect;
