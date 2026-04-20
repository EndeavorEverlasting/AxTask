// Tasks + everything that references a task: classification (catalog +
// confirmations + contributions + disputes + votes + review triggers),
// study mini-games (decks/cards/sessions/review events), collaboration
// (collaborators + inbox messages + classification thumbs), pattern
// learning, and the per-user task-import fingerprint dedupe table.
//
// Back-compat boundary: this file must NOT import from "./gamification"
// or "./ops". The Drizzle FK closures (`() => users.id`) make cross-file
// references safe at runtime, but keeping import edges upstream-only
// (core → tasks → ops) prevents TypeScript module cycles.

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index, uniqueIndex, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./core";

/** Multi-label classification with confidence (0–1). Primary label is always `tasks.classification`. */
export const classificationAssociationSchema = z.object({
  label: z.string().min(1).max(64),
  confidence: z.number().min(0).max(1),
});
export type ClassificationAssociation = z.infer<typeof classificationAssociationSchema>;
export const classificationAssociationsSchema = z.array(classificationAssociationSchema).max(8);

/** Task notes cap — keep in sync with voice review routes (`server/routes.ts`). */
export const TASK_NOTES_MAX_CHARS = 10_000;

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
  notes: z
    .string()
    .max(TASK_NOTES_MAX_CHARS, `Notes must be under ${TASK_NOTES_MAX_CHARS} characters`)
    .optional(),
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

// ─── Task Import Fingerprints (per-user dedupe for bulk import flows) ───────
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

// ─── Classification Thumbs (per-user 👍 on a task's auto-classification) ────
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

// ─── Collaboration Inbox ────────────────────────────────────────────────────
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

// ─── Classification Disputes (peer challenge to auto-classifications) ───────
/**
 * User challenges an auto-classification on a specific task, suggesting an
 * alternative category. Peers vote agree/disagree via classificationDisputeVotes;
 * per-category-pair aggregate tallies in categoryReviewTriggers flip status
 * through monitoring -> contested -> review_needed at the thresholds enforced
 * in storage.updateCategoryReviewTracker (>=5 disputes, >=70% agreement).
 *
 * Additive to classificationContributions / classificationConfirmations:
 * confirmations are the "agree" path (economic, compounding coins); disputes
 * are the "disagree" path (moderation metadata; no coin rewards in this PR).
 *
 * Baseline ported from commit 163b692; see docs/BASELINE_PUBLISHED_AUDIT.md
 * section 4b #7. The 675-line NodeWeaver TS engine stub from the same commit
 * is NOT ported — main has the real classifier as a vendored Python service.
 */
export const classificationDisputes = pgTable("classification_disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  originalCategory: text("original_category").notNull(),
  suggestedCategory: text("suggested_category").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_class_dispute_task").on(table.taskId),
  index("idx_class_dispute_user").on(table.userId),
  uniqueIndex("ux_class_dispute_task_user").on(table.taskId, table.userId),
]);

export type ClassificationDispute = typeof classificationDisputes.$inferSelect;

export const classificationDisputeVotes = pgTable("classification_dispute_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  disputeId: varchar("dispute_id").notNull().references(() => classificationDisputes.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  agree: boolean("agree").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_class_dispute_votes_dispute").on(table.disputeId),
  uniqueIndex("ux_class_dispute_votes_user_dispute").on(table.userId, table.disputeId),
]);

export type ClassificationDisputeVote = typeof classificationDisputeVotes.$inferSelect;

export const categoryReviewTriggers = pgTable("category_review_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalCategory: text("original_category").notNull(),
  suggestedCategory: text("suggested_category").notNull(),
  disputeCount: integer("dispute_count").notNull().default(0),
  agreeCount: integer("agree_count").notNull().default(0),
  totalVotes: integer("total_votes").notNull().default(0),
  consensusRatio: doublePrecision("consensus_ratio").notNull().default(0),
  status: text("status").notNull().default("monitoring"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolveOutcome: text("resolve_outcome"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_crt_original").on(table.originalCategory),
  index("idx_crt_status").on(table.status),
  uniqueIndex("ux_crt_category_pair").on(table.originalCategory, table.suggestedCategory),
]);

export type CategoryReviewTrigger = typeof categoryReviewTriggers.$inferSelect;

export const CATEGORY_REVIEW_STATUSES = ["monitoring", "contested", "review_needed", "resolved"] as const;
export type CategoryReviewStatus = (typeof CATEGORY_REVIEW_STATUSES)[number];

export const insertClassificationDisputeSchema = createInsertSchema(classificationDisputes).omit({
  id: true,
  createdAt: true,
}).extend({
  originalCategory: z.string().min(1).max(80),
  suggestedCategory: z.string().min(1).max(80),
  reason: z.string().trim().max(500).nullish(),
});
export type InsertClassificationDispute = z.infer<typeof insertClassificationDisputeSchema>;
