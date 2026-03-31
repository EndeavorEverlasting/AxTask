import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
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
