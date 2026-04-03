import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
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
export type SafeUser = Omit<User, "passwordHash" | "securityAnswerHash" | "failedLoginAttempts" | "lockedUntil" | "workosId" | "googleId" | "replitId">;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type SecurityLog = typeof securityLogs.$inferSelect;

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
  priority: text("priority").notNull(),
  priorityScore: integer("priority_score").notNull(),
  classification: text("classification").notNull(),
  status: text("status").notNull().default("pending"),
  isRepeated: boolean("is_repeated").default(false),
  sortOrder: integer("sort_order").default(0),
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
  isRepeated: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  date: z.string().min(1, "Date is required"),
  time: z.string().optional(),
  activity: z.string().min(1, "Activity is required").max(500, "Activity must be under 500 characters"),
  notes: z.string().max(2000, "Notes must be under 2000 characters").optional(),
  urgency: z.number().min(1).max(5).optional(),
  impact: z.number().min(1).max(5).optional(),
  effort: z.number().min(1).max(5).optional(),
  prerequisites: z.string().max(1000, "Prerequisites must be under 1000 characters").optional(),
  status: z.enum(["pending", "in-progress", "completed"]).default("pending"),
});

export const updateTaskSchema = insertTaskSchema.partial().extend({
  id: z.string(),
  priority: z.string().optional(),
  priorityScore: z.number().optional(),
  classification: z.string().optional(),
  isRepeated: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export const reorderTasksSchema = z.object({
  taskIds: z.array(z.string()).min(1, "At least one task ID is required"),
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// ─── Gamification: Wallets ──────────────────────────────────────────────────
export const wallets = pgTable("wallets", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastCompletionDate: text("last_completion_date"),
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
  skillKey: text("skill_key").notNull().unique(),
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
  maxAttachmentBytes: integer("max_attachment_bytes").notNull().default(50 * 1024 * 1024),
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
]);

export type AttachmentAsset = typeof attachmentAssets.$inferSelect;

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
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_mfa_challenges_user").on(table.userId),
  index("idx_mfa_challenges_expires").on(table.expiresAt),
]);

export type MfaChallenge = typeof mfaChallenges.$inferSelect;

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
