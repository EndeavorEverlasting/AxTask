import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
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
  recurrence: text("recurrence").default("none"),
  priority: text("priority").notNull(),
  priorityScore: integer("priority_score").notNull(),
  classification: text("classification").notNull(),
  status: text("status").notNull().default("pending"),
  isRepeated: boolean("is_repeated").default(false),
  bounty: integer("bounty").default(0),
  bountySetBy: varchar("bounty_set_by").references(() => users.id),
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
  recurrence: z.string().refine(
    (v) => {
      if (["none", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"].includes(v)) return true;
      if (v.startsWith("custom:days:")) {
        const days = v.replace("custom:days:", "").split(",");
        const valid = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
        return days.length > 0 && days.every(d => valid.includes(d));
      }
      if (v.startsWith("custom:dates:")) {
        const dates = v.replace("custom:dates:", "").split(",").map(Number);
        return dates.length > 0 && dates.every(d => Number.isInteger(d) && d >= 1 && d <= 31);
      }
      return false;
    },
    { message: "Invalid recurrence pattern" }
  ).default("none"),
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
  streakShields: integer("streak_shields").notNull().default(0),
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

// ─── Pattern Learning ────────────────────────────────────────────────────────
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
