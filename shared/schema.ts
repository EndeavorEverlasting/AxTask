import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, bigint, timestamp, boolean, index, uniqueIndex, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
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

/** Multi-label classification with confidence (0–1). Primary label is always `tasks.classification`. */
export const classificationAssociationSchema = z.object({
  label: z.string().min(1).max(64),
  confidence: z.number().min(0).max(1),
});
export type ClassificationAssociation = z.infer<typeof classificationAssociationSchema>;
export const classificationAssociationsSchema = z.array(classificationAssociationSchema).max(8);

// ─── Tasks ───────────────────────────────────────────────────────────────────
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  time: text("time"),
  activity: text("activity").notNull(),
  notes: text("notes").default(""),
  urgency: integer("urgency"),
  impact: integer("impact"),
  effort: integer("effort"),
  prerequisites: text("prerequisites").default(""),
  recurrence: text("recurrence").notNull().default("none"),
  priority: text("priority").notNull(),
  priorityScore: integer("priority_score").notNull(),
  classification: text("classification").notNull(),
  /** Ordered candidates with confidence; primary is `classification`. */
  classificationAssociations: jsonb("classification_associations").$type<ClassificationAssociation[] | null>(),
  status: text("status").notNull().default("pending"),
  isRepeated: boolean("is_repeated").default(false),
  sortOrder: integer("sort_order").default(0),
  visibility: text("visibility").notNull().default("private"),
  communityShowNotes: boolean("community_show_notes").notNull().default(false),
  /** Optional planned start (ISO date or datetime). When absent, the Gantt falls back to `date`+`time`. */
  startDate: text("start_date"),
  /** Optional planned end (ISO date or datetime). When absent, derived from `startDate + durationMinutes`. */
  endDate: text("end_date"),
  /** Optional planned duration in minutes; used when only `startDate` is known. */
  durationMinutes: integer("duration_minutes"),
  /** Structured predecessor task IDs for Gantt dependency arrows; `prerequisites` stays human-readable. */
  dependsOn: jsonb("depends_on").$type<string[] | null>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_tasks_user_status").on(table.userId, table.status),
  index("idx_tasks_user_priority").on(table.userId, table.priority),
  index("idx_tasks_user_sort_order").on(table.userId, table.sortOrder),
]);

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  userId: true,
  priority: true,
  priorityScore: true,
  classification: true,
  classificationAssociations: true,
  isRepeated: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  date: z.string().min(1, "Date is required"),
  time: z.string().optional(),
  activity: z.string().min(1, "Activity is required").max(500, "Activity must be under 500 characters"),
  notes: z.string().max(10000, "Notes must be under 10000 characters").optional(),
  urgency: z.number().min(1).max(5).optional(),
  impact: z.number().min(1).max(5).optional(),
  effort: z.number().min(1).max(5).optional(),
  prerequisites: z.string().max(1000, "Prerequisites must be under 1000 characters").optional(),
  recurrence: z
    .enum(["none", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"])
    .default("none"),
  status: z.enum(["pending", "in-progress", "completed"]).default("pending"),
  visibility: z.enum(["private", "public"]).default("private"),
  communityShowNotes: z.boolean().default(false),
  startDate: z.string().max(40).optional().nullable(),
  endDate: z.string().max(40).optional().nullable(),
  durationMinutes: z.number().int().min(0).max(60 * 24 * 365).optional().nullable(),
  dependsOn: z.array(z.string().min(1).max(64)).max(32).optional().nullable(),
});

export const updateTaskSchema = insertTaskSchema.partial().extend({
  id: z.string(),
  priority: z.string().optional(),
  priorityScore: z.number().optional(),
  classification: z.string().optional(),
  classificationAssociations: classificationAssociationsSchema.nullable().optional(),
  isRepeated: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export const reorderTasksSchema = z.object({
  taskIds: z.array(z.string()).min(1, "At least one task ID is required"),
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type Task = typeof tasks.$inferSelect;

/** One user may confirm a task's classification once (solo + future multi-viewer). */
export const taskClassificationConfirmations = pgTable(
  "task_classification_confirmations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    taskId: varchar("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_task_classification_confirmations_task_user").on(table.taskId, table.userId),
    index("idx_task_classification_confirmations_task").on(table.taskId),
  ],
);

export type TaskClassificationConfirmation = typeof taskClassificationConfirmations.$inferSelect;

/** User-defined classification labels (shown alongside built-in catalog). */
export const userClassificationLabels = pgTable(
  "user_classification_labels",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Mirrors lower(label); used for unique constraint without expression indexes (drizzle-kit push). */
    labelLower: text("label_lower").generatedAlwaysAs(sql`lower(label)`),
    coins: integer("coins").notNull().default(3),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_user_classification_labels_user").on(table.userId),
    uniqueIndex("ux_user_class_labels_user_lower").on(table.userId, table.labelLower),
  ],
);

export type UserClassificationLabel = typeof userClassificationLabels.$inferSelect;

// ─── Study Mini-Games ───────────────────────────────────────────────────────
export const studyDecks = pgTable("study_decks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  sourceType: text("source_type").notNull().default("manual"), // manual | tasks | planner
  sourceRef: text("source_ref"),
  cardLimitPerSession: integer("card_limit_per_session").notNull().default(10),
  sessionDurationMinutes: integer("session_duration_minutes").notNull().default(5),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_study_decks_user").on(table.userId),
  index("idx_study_decks_source").on(table.sourceType),
]);

export const studyCards = pgTable("study_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deckId: varchar("deck_id").notNull().references(() => studyDecks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  topic: text("topic"),
  tagsJson: text("tags_json"),
  sourceTaskId: varchar("source_task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_study_cards_deck").on(table.deckId),
  index("idx_study_cards_user").on(table.userId),
  index("idx_study_cards_source_task").on(table.sourceTaskId),
]);

export const studySessions = pgTable("study_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deckId: varchar("deck_id").notNull().references(() => studyDecks.id, { onDelete: "cascade" }),
  gameType: text("game_type").notNull().default("flashcard_sprint"),
  status: text("status").notNull().default("active"), // active | completed | abandoned
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  totalCards: integer("total_cards").notNull().default(0),
  answeredCards: integer("answered_cards").notNull().default(0),
  correctCards: integer("correct_cards").notNull().default(0),
  scorePercent: integer("score_percent").notNull().default(0),
  avgResponseMs: integer("avg_response_ms"),
  weakTopicsJson: text("weak_topics_json"),
  rewardCoins: integer("reward_coins").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_study_sessions_user").on(table.userId),
  index("idx_study_sessions_deck").on(table.deckId),
  index("idx_study_sessions_status").on(table.status),
]);

export const studyReviewEvents = pgTable("study_review_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull().references(() => studySessions.id, { onDelete: "cascade" }),
  cardId: varchar("card_id").notNull().references(() => studyCards.id, { onDelete: "cascade" }),
  grade: text("grade").notNull(), // again | hard | good | easy
  isCorrect: boolean("is_correct").notNull().default(false),
  responseMs: integer("response_ms"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_study_events_user").on(table.userId),
  index("idx_study_events_session").on(table.sessionId),
  index("idx_study_events_card").on(table.cardId),
  uniqueIndex("ux_study_events_session_card_created").on(table.sessionId, table.cardId, table.createdAt),
]);

export const createStudyDeckSchema = createInsertSchema(studyDecks).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  sourceType: z.enum(["manual", "tasks", "planner"]).default("manual"),
  sourceRef: z.string().max(200).optional(),
  cardLimitPerSession: z.number().int().min(3).max(100).default(10),
  sessionDurationMinutes: z.number().int().min(1).max(30).default(5),
});

export const createStudyCardSchema = createInsertSchema(studyCards).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  prompt: z.string().min(2).max(500),
  answer: z.string().min(1).max(2000),
  topic: z.string().max(120).optional(),
  tagsJson: z.string().max(2000).optional(),
});

export const startStudySessionSchema = z.object({
  deckId: z.string().min(1),
  gameType: z.enum(["flashcard_sprint"]).default("flashcard_sprint"),
});

export const submitStudyAnswerSchema = z.object({
  cardId: z.string().min(1),
  grade: z.enum(["again", "hard", "good", "easy"]),
  responseMs: z.number().int().min(0).max(600000).optional(),
});

export type StudyDeck = typeof studyDecks.$inferSelect;
export type StudyCard = typeof studyCards.$inferSelect;
export type StudySession = typeof studySessions.$inferSelect;
export type StudyReviewEvent = typeof studyReviewEvents.$inferSelect;
export type CreateStudyDeckInput = z.infer<typeof createStudyDeckSchema>;
export type CreateStudyCardInput = z.infer<typeof createStudyCardSchema>;
export type StartStudySessionInput = z.infer<typeof startStudySessionSchema>;
export type SubmitStudyAnswerInput = z.infer<typeof submitStudyAnswerSchema>;

// ─── Task Collaborators ─────────────────────────────────────────────────────
export const taskCollaborators = pgTable("task_collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("editor"),
  invitedBy: varchar("invited_by").references(() => users.id),
  invitedAt: timestamp("invited_at").defaultNow(),
}, (table) => [
  index("idx_collab_task").on(table.taskId),
  index("idx_collab_user").on(table.userId),
  index("idx_collab_task_user").on(table.taskId, table.userId),
]);

export type TaskCollaborator = typeof taskCollaborators.$inferSelect;
export const insertCollaboratorSchema = createInsertSchema(taskCollaborators).omit({ id: true, invitedAt: true });

// ─── Gamification: Wallets ──────────────────────────────────────────────────
export const wallets = pgTable("wallets", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastCompletionDate: text("last_completion_date"),
  comboCount: integer("combo_count").notNull().default(0),
  bestComboCount: integer("best_combo_count").notNull().default(0),
  comboWindowStartedAt: timestamp("combo_window_started_at"),
  lastCompletionAt: timestamp("last_completion_at"),
  chainCount24h: integer("chain_count_24h").notNull().default(0),
  bestChainCount24h: integer("best_chain_count_24h").notNull().default(0),
});

export type Wallet = typeof wallets.$inferSelect;

// ─── Gamification: Coin Transactions ────────────────────────────────────────
export const coinTransactions = pgTable("coin_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  taskId: varchar("task_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_coin_tx_user").on(table.userId),
  index("idx_coin_tx_created").on(table.createdAt),
  index("idx_coin_tx_task").on(table.taskId),
]);

export type CoinTransaction = typeof coinTransactions.$inferSelect;

// ─── Gamification: User Badges ──────────────────────────────────────────────
export const userBadges = pgTable("user_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  badgeId: text("badge_id").notNull(),
  earnedAt: timestamp("earned_at").defaultNow(),
}, (table) => [
  index("idx_user_badges_user").on(table.userId),
]);

export type UserBadge = typeof userBadges.$inferSelect;

// ─── Gamification: Rewards Catalog ──────────────────────────────────────────
export const rewardsCatalog = pgTable("rewards_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  cost: integer("cost").notNull(),
  /** When set, any avatar profile at or above this level can redeem without spending coins. */
  unlockAtAvatarLevel: integer("unlock_at_avatar_level"),
  type: text("type").notNull(),
  icon: text("icon"),
  data: text("data"),
});

export type RewardItem = typeof rewardsCatalog.$inferSelect;

// ─── Gamification: User Redeemed Rewards ────────────────────────────────────
export const userRewards = pgTable("user_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rewardId: varchar("reward_id").notNull().references(() => rewardsCatalog.id),
  redeemedAt: timestamp("redeemed_at").defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
  /** Coins paid when redeeming from catalog; 0 for avatar-level unlocks. Used for sell-back refunds. */
  coinsSpentAtRedeem: integer("coins_spent_at_redeem").notNull().default(0),
}, (table) => [
  index("idx_user_rewards_user").on(table.userId),
]);

export type UserReward = typeof userRewards.$inferSelect;

// ─── Gamification: Offline Generator ─────────────────────────────────────────
export const offlineGenerators = pgTable("offline_generators", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  isOwned: boolean("is_owned").notNull().default(false),
  level: integer("level").notNull().default(0),
  baseRatePerHour: integer("base_rate_per_hour").notNull().default(0),
  baseCapacityHours: integer("base_capacity_hours").notNull().default(12),
  lastClaimAt: timestamp("last_claim_at"),
  totalGenerated: integer("total_generated").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type OfflineGenerator = typeof offlineGenerators.$inferSelect;

export const offlineSkillNodes = pgTable("offline_skill_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  skillKey: text("skill_key").notNull().unique("offline_skill_nodes_skill_key_unique"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  branch: text("branch").notNull(),
  maxLevel: integer("max_level").notNull().default(1),
  baseCost: integer("base_cost").notNull().default(100),
  effectType: text("effect_type").notNull(),
  effectPerLevel: integer("effect_per_level").notNull().default(0),
  prerequisiteSkillKey: text("prerequisite_skill_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_offline_skill_nodes_branch").on(table.branch),
  index("idx_offline_skill_nodes_sort").on(table.sortOrder),
]);

export type OfflineSkillNode = typeof offlineSkillNodes.$inferSelect;

export const userOfflineSkills = pgTable("user_offline_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillNodeId: varchar("skill_node_id").notNull().references(() => offlineSkillNodes.id, { onDelete: "cascade" }),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_user_offline_skills_user_node").on(table.userId, table.skillNodeId),
  index("idx_user_offline_skills_user").on(table.userId),
]);

export type UserOfflineSkill = typeof userOfflineSkills.$inferSelect;

export const avatarSkillNodes = pgTable("avatar_skill_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  skillKey: text("skill_key").notNull().unique("avatar_skill_nodes_skill_key_unique"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  branch: text("branch").notNull(),
  maxLevel: integer("max_level").notNull().default(1),
  baseCost: integer("base_cost").notNull().default(100),
  effectType: text("effect_type").notNull(),
  effectPerLevel: integer("effect_per_level").notNull().default(0),
  prerequisiteSkillKey: text("prerequisite_skill_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_avatar_skill_nodes_branch").on(table.branch),
  index("idx_avatar_skill_nodes_sort").on(table.sortOrder),
]);

export type AvatarSkillNode = typeof avatarSkillNodes.$inferSelect;

export const userAvatarSkills = pgTable("user_avatar_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillNodeId: varchar("skill_node_id").notNull().references(() => avatarSkillNodes.id, { onDelete: "cascade" }),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_user_avatar_skills_user_node").on(table.userId, table.skillNodeId),
  index("idx_user_avatar_skills_user").on(table.userId),
]);

export type UserAvatarSkill = typeof userAvatarSkills.$inferSelect;

export const userAvatarProfiles = pgTable("user_avatar_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  avatarKey: text("avatar_key").notNull(),
  displayName: text("display_name").notNull(),
  archetypeKey: text("archetype_key").notNull(),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  totalXp: integer("total_xp").notNull().default(0),
  mission: text("mission").notNull().default("Complete a task to gain XP."),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_user_avatar_profiles_user_avatar").on(table.userId, table.avatarKey),
  index("idx_user_avatar_profiles_user").on(table.userId),
]);

export type UserAvatarProfile = typeof userAvatarProfiles.$inferSelect;

// ─── Storage, Usage, and Attachments ────────────────────────────────────────
export const usageSnapshots = pgTable("usage_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: text("snapshot_date").notNull(),
  source: text("source").notNull().default("internal"),
  requests: integer("requests").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  p95Ms: integer("p95_ms").notNull().default(0),
  dbStorageMb: integer("db_storage_mb").notNull().default(0),
  taskCount: integer("task_count").notNull().default(0),
  attachmentBytes: integer("attachment_bytes").notNull().default(0),
  spendMtdCents: integer("spend_mtd_cents").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_usage_snapshots_date").on(table.snapshotDate),
]);

export type UsageSnapshot = typeof usageSnapshots.$inferSelect;

export const storagePolicies = pgTable("storage_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  maxTasks: integer("max_tasks").notNull().default(100000),
  maxAttachmentBytes: bigint("max_attachment_bytes", { mode: "number" }).notNull().default(15 * 1024 * 1024 * 1024),
  maxAttachmentCount: integer("max_attachment_count").notNull().default(500),
  maxTaskRetentionDays: integer("max_task_retention_days").notNull().default(3650),
  softWarningPercent: integer("soft_warning_percent").notNull().default(80),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_storage_policies_user").on(table.userId),
]);

export type StoragePolicy = typeof storagePolicies.$inferSelect;

export const attachmentAssets = pgTable("attachment_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "set null" }),
  kind: text("kind").notNull().default("feedback"),
  fileName: text("file_name"),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull().default(0),
  storageKey: text("storage_key"),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_attachment_assets_user").on(table.userId),
  index("idx_attachment_assets_kind").on(table.kind),
  index("idx_attachment_assets_task").on(table.taskId),
]);

export type AttachmentAsset = typeof attachmentAssets.$inferSelect;

/**
 * Polymorphic join linking `attachment_assets` to any composable owner
 * (collab inbox message, community post/reply, feedback report, task note).
 * The (ownerType, ownerId) pair is always the parent body row; the SPA
 * references attachments in markdown via `attachment:<assetId>` which is
 * validated against this table to prevent cross-user referencing.
 */
export const messageAttachments = pgTable("message_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** Discriminator - see docs/PASTE_COMPOSER_SECURITY.md for the closed set. */
  ownerType: text("owner_type").notNull(),
  ownerId: varchar("owner_id").notNull(),
  assetId: varchar("asset_id")
    .notNull()
    .references(() => attachmentAssets.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_message_attachments_owner").on(table.ownerType, table.ownerId),
  index("idx_message_attachments_asset").on(table.assetId),
  index("idx_message_attachments_user").on(table.userId),
  uniqueIndex("ux_message_attachments_owner_asset").on(
    table.ownerType,
    table.ownerId,
    table.assetId,
  ),
]);

export type MessageAttachment = typeof messageAttachments.$inferSelect;

/** Closed set of valid `ownerType` discriminators. */
export const MESSAGE_ATTACHMENT_OWNER_TYPES = [
  "task_note",
  "feedback",
  "collab_message",
  "community_post",
  "community_reply",
] as const;
export type MessageAttachmentOwnerType =
  (typeof MESSAGE_ATTACHMENT_OWNER_TYPES)[number];

export const taskImportFingerprints = pgTable("task_import_fingerprints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(),
  source: text("source").notNull().default("import"),
  firstTaskId: varchar("first_task_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_task_import_fingerprints_user_fingerprint").on(table.userId, table.fingerprint),
  index("idx_task_import_fingerprints_source").on(table.source),
]);

export type TaskImportFingerprint = typeof taskImportFingerprints.$inferSelect;

// ─── Invoicing and Security Foundations ─────────────────────────────────────
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  invoiceNumber: text("invoice_number").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("draft"),
  confirmationNumber: text("confirmation_number"),
  externalReference: text("external_reference"),
  dueDate: text("due_date"),
  issuedAt: timestamp("issued_at"),
  paidAt: timestamp("paid_at"),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_invoices_invoice_number").on(table.invoiceNumber),
  index("idx_invoices_user").on(table.userId),
  index("idx_invoices_status").on(table.status),
]);

export type Invoice = typeof invoices.$inferSelect;

export const invoiceEvents = pgTable("invoice_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_invoice_events_invoice").on(table.invoiceId),
]);

export type InvoiceEvent = typeof invoiceEvents.$inferSelect;

export const mfaChallenges = pgTable("mfa_challenges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  attempts: integer("attempts").notNull().default(0),
  /** How the OTP was delivered: email | sms */
  deliveryChannel: text("delivery_channel").notNull().default("email"),
  /** SMS destination for this challenge; null when channel is email or when using profile phone (still resolved at send time). */
  smsDestinationE164: text("sms_destination_e164"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_mfa_challenges_user").on(table.userId),
  index("idx_mfa_challenges_expires").on(table.expiresAt),
]);

export type MfaChallenge = typeof mfaChallenges.$inferSelect;

/** Non-PCI payment method fingerprints only — full PAN must never be sent or stored. */
export const billingPaymentMethods = pgTable("billing_payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  brand: text("brand").notNull(),
  last4: text("last4").notNull(),
  expMonth: integer("exp_month").notNull(),
  expYear: integer("exp_year").notNull(),
  country: text("country"),
  postalCode: text("postal_code"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_billing_pm_user").on(table.userId),
]);

export type BillingPaymentMethod = typeof billingPaymentMethods.$inferSelect;

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull(),
  route: text("route").notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  responseHash: text("response_hash"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_idempotency_keys_key_route").on(table.key, table.route),
]);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;

export const createInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  amountCents: z.number().int().positive("Amount must be positive"),
  currency: z.string().length(3, "Currency must be a 3-letter code").default("USD"),
  status: z.enum(["draft", "issued", "paid", "void"]).default("draft"),
});

export const createAttachmentAssetSchema = createInsertSchema(attachmentAssets).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
}).extend({
  mimeType: z.string().min(3).max(128),
  byteSize: z.number().int().nonnegative(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateAttachmentAssetInput = z.infer<typeof createAttachmentAssetSchema>;

// ─── Premium Retention Foundations ───────────────────────────────────────────
export const premiumSubscriptions = pgTable("premium_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  product: text("product").notNull(), // axtask | nodeweaver | bundle
  planKey: text("plan_key").notNull(), // pro_monthly | pro_yearly | bundle_monthly
  status: text("status").notNull().default("active"), // active | grace | inactive
  startsAt: timestamp("starts_at").defaultNow(),
  endsAt: timestamp("ends_at"),
  graceUntil: timestamp("grace_until"),
  downgradedAt: timestamp("downgraded_at"),
  reactivatedAt: timestamp("reactivated_at"),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_premium_subscriptions_user").on(table.userId),
  index("idx_premium_subscriptions_product").on(table.product),
  index("idx_premium_subscriptions_status").on(table.status),
]);

export type PremiumSubscription = typeof premiumSubscriptions.$inferSelect;

export const premiumSavedViews = pgTable("premium_saved_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filtersJson: text("filters_json").notNull(),
  autoRefreshMinutes: integer("auto_refresh_minutes").notNull().default(15),
  isDefault: boolean("is_default").notNull().default(false),
  lastOpenedAt: timestamp("last_opened_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_premium_saved_views_user").on(table.userId),
  index("idx_premium_saved_views_default").on(table.userId, table.isDefault),
]);

export type PremiumSavedView = typeof premiumSavedViews.$inferSelect;

export const premiumReviewWorkflows = pgTable("premium_review_workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  cadence: text("cadence").notNull().default("weekly"), // daily | weekly | monthly
  criteriaJson: text("criteria_json").notNull(),
  templateJson: text("template_json").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_premium_review_workflows_user").on(table.userId),
  index("idx_premium_review_workflows_active").on(table.userId, table.isActive),
]);

export type PremiumReviewWorkflow = typeof premiumReviewWorkflows.$inferSelect;

export const premiumInsights = pgTable("premium_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // axtask | nodeweaver | bundle
  insightType: text("insight_type").notNull(), // confidence_drift | overdue_cluster | digest
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("open"), // open | resolved
  severity: text("severity").notNull().default("medium"),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("idx_premium_insights_user").on(table.userId),
  index("idx_premium_insights_status").on(table.userId, table.status),
  index("idx_premium_insights_source").on(table.source),
]);

export type PremiumInsight = typeof premiumInsights.$inferSelect;

export const premiumEvents = pgTable("premium_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  eventName: text("event_name").notNull(),
  product: text("product").notNull(),
  planKey: text("plan_key"),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_premium_events_name").on(table.eventName),
  index("idx_premium_events_user").on(table.userId),
  index("idx_premium_events_created").on(table.createdAt),
]);

export type PremiumEvent = typeof premiumEvents.$inferSelect;

export const createPremiumSavedViewSchema = createInsertSchema(premiumSavedViews).omit({
  id: true,
  userId: true,
  isDefault: true,
  lastOpenedAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(2).max(120),
  filtersJson: z.string().min(2).max(4000),
  autoRefreshMinutes: z.number().int().min(1).max(1440).default(15),
});

export const createPremiumReviewWorkflowSchema = createInsertSchema(premiumReviewWorkflows).omit({
  id: true,
  userId: true,
  lastRunAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(2).max(120),
  cadence: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  criteriaJson: z.string().min(2).max(4000),
  templateJson: z.string().min(2).max(4000),
  isActive: z.boolean().default(true),
});

// ─── Community Posts (avatar-generated forum) ───────────────────────────────
export const communityPosts = pgTable("community_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** Which avatar engine authored the post */
  avatarKey: text("avatar_key").notNull(), // mood | archetype | productivity | social | lazy
  avatarName: text("avatar_name").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** Loose category for filtering / colour-coding */
  category: text("category").notNull().default("general"),
  /** Optional link to source task (never exposes userId) */
  relatedTaskId: varchar("related_task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_community_posts_avatar").on(table.avatarKey),
  index("idx_community_posts_created").on(table.createdAt),
]);

export type CommunityPost = typeof communityPosts.$inferSelect;

export const communityReplies = pgTable("community_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => communityPosts.id, { onDelete: "cascade" }),
  /** null = avatar reply, non-null = human reply */
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  avatarKey: text("avatar_key"),
  displayName: text("display_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_community_replies_post").on(table.postId),
]);

export type CommunityReply = typeof communityReplies.$inferSelect;

// ─── Expansion 2026-04-18: thumbs, alarms, collab inbox, location ────────────
export const taskClassificationThumbs = pgTable(
  "task_classification_thumbs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    taskId: varchar("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_task_classification_thumbs_task_user").on(table.taskId, table.userId),
    index("idx_task_classification_thumbs_task").on(table.taskId),
  ],
);

export type TaskClassificationThumb = typeof taskClassificationThumbs.$inferSelect;

export const userAlarmSnapshots = pgTable(
  "user_alarm_snapshots",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceKey: text("device_key").notNull().default("default"),
    label: text("label").notNull().default("capture"),
    payloadJson: text("payload_json").notNull(),
    capturedAt: timestamp("captured_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_user_alarm_snapshots_user").on(table.userId)],
);

export type UserAlarmSnapshot = typeof userAlarmSnapshots.$inferSelect;

export const collaborationInboxMessages = pgTable(
  "collaboration_inbox_messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderUserId: varchar("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    taskId: varchar("task_id").references(() => tasks.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_collab_inbox_user").on(table.userId),
    index("idx_collab_inbox_created").on(table.createdAt),
  ],
);

export type CollaborationInboxMessage = typeof collaborationInboxMessages.$inferSelect;

export const userLocationPlaces = pgTable(
  "user_location_places",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    radiusMeters: integer("radius_meters").notNull().default(200),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_user_location_places_user").on(table.userId)],
);

export type UserLocationPlace = typeof userLocationPlaces.$inferSelect;

// ─── Pattern Learning (replit-published line; union with experimental) ───────
export const taskPatterns = pgTable("task_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  patternType: text("pattern_type").notNull(),
  patternKey: text("pattern_key").notNull(),
  data: text("data").notNull().default("{}"),
  confidence: integer("confidence").notNull().default(0),
  occurrences: integer("occurrences").notNull().default(1),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_patterns_user").on(table.userId),
  index("idx_patterns_user_type").on(table.userId, table.patternType),
  index("idx_patterns_user_key").on(table.userId, table.patternKey),
  uniqueIndex("idx_patterns_user_type_key").on(table.userId, table.patternType, table.patternKey),
]);

export type TaskPattern = typeof taskPatterns.$inferSelect;
export type InsertTaskPattern = typeof taskPatterns.$inferInsert;

// ─── Classification Contributions ───────────────────────────────────────────
export const classificationContributions = pgTable("classification_contributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  classification: text("classification").notNull(),
  baseCoinsAwarded: integer("base_coins_awarded").notNull().default(0),
  totalCoinsEarned: integer("total_coins_earned").notNull().default(0),
  confirmationCount: integer("confirmation_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_class_contrib_task").on(table.taskId),
  index("idx_class_contrib_user").on(table.userId),
  uniqueIndex("idx_class_contrib_task_user").on(table.taskId, table.userId),
]);

export type ClassificationContribution = typeof classificationContributions.$inferSelect;

// ─── Classification Confirmations ───────────────────────────────────────────
export const classificationConfirmations = pgTable("classification_confirmations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contributionId: varchar("contribution_id").notNull().references(() => classificationContributions.id, { onDelete: "cascade" }),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  coinsAwarded: integer("coins_awarded").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_class_confirm_contrib").on(table.contributionId),
  index("idx_class_confirm_task").on(table.taskId),
  uniqueIndex("idx_class_confirm_task_user").on(table.taskId, table.userId),
]);

export type ClassificationConfirmation = typeof classificationConfirmations.$inferSelect;

// ─── Archetype Empathy Analytics ────────────────────────────────────────────
/**
 * Per-archetype, per-day empathy rollup. Computed by the archetype-rollup
 * worker from `security_events` rows with `event_type='archetype_signal'`.
 * Only the archetype key is stored — never per-user data.
 *
 * See docs/ARCHETYPE_EMPATHY_ANALYTICS.md.
 */
export const archetypeRollupDaily = pgTable("archetype_rollup_daily", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  archetypeKey: text("archetype_key").notNull(),
  bucketDate: text("bucket_date").notNull(),
  empathyScore: doublePrecision("empathy_score").notNull().default(0),
  samples: integer("samples").notNull().default(0),
  signalsJson: jsonb("signals_json").notNull().default(sql`'{}'::jsonb`),
  computedAt: timestamp("computed_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_archetype_rollup_daily_key_date").on(table.archetypeKey, table.bucketDate),
  index("idx_archetype_rollup_daily_date").on(table.bucketDate),
  index("idx_archetype_rollup_daily_key").on(table.archetypeKey),
]);

export type ArchetypeRollupDaily = typeof archetypeRollupDaily.$inferSelect;

/**
 * Per-archetype Markov transition counts per day. Computed from hashed-actor
 * sequences of archetype_signal events. The probability matrix is derived at
 * read time by row-normalizing counts.
 */
export const archetypeMarkovDaily = pgTable("archetype_markov_daily", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromArchetype: text("from_archetype").notNull(),
  toArchetype: text("to_archetype").notNull(),
  bucketDate: text("bucket_date").notNull(),
  count: integer("count").notNull().default(0),
  computedAt: timestamp("computed_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_archetype_markov_daily_triple").on(table.fromArchetype, table.toArchetype, table.bucketDate),
  index("idx_archetype_markov_daily_date").on(table.bucketDate),
  index("idx_archetype_markov_daily_from").on(table.fromArchetype),
]);

export type ArchetypeMarkovDaily = typeof archetypeMarkovDaily.$inferSelect;
