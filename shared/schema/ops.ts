// Operational domain tables that don't belong to core, tasks, or
// gamification: usage + storage policy rollups, attachment assets +
// polymorphic owner join, invoicing + billing payment methods + MFA
// challenges + idempotency keys, premium retention foundations, community
// forum (posts/replies), device state (alarm snapshots + location places),
// and archetype empathy analytics rollups.
//
// Imports upstream from ./core (users) and ./tasks (tasks). Do NOT import
// from ./gamification — no table here references rewards/coins directly.

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, bigint, timestamp, boolean, index, uniqueIndex, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./core";
import { tasks } from "./tasks";

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

// ─── Device: alarm snapshots + location places ──────────────────────────────
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
