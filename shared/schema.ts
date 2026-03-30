import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),                     // null for OAuth-only users
  displayName: text("display_name"),
  role: text("role").notNull().default("user"),            // "admin" | "user"
  authProvider: text("auth_provider").notNull().default("local"), // "local" | "workos" | "google" | "replit"
  workosId: text("workos_id"),                             // WorkOS user ID (when provider=workos)
  googleId: text("google_id"),                             // Google sub (when provider=google)
  replitId: text("replit_id"),                             // Replit OIDC sub (when provider=replit)
  profileImageUrl: text("profile_image_url"),              // Profile picture URL from OAuth
  securityQuestion: text("security_question"),              // e.g. "What is your pet's name?"
  securityAnswerHash: text("security_answer_hash"),         // bcrypt hash of the answer
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),                  // null = not locked
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Password Reset Tokens ───────────────────────────────────────────────────
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),                  // SHA-256 hash of the token
  method: text("method").notNull().default("email"),        // "email" | "security_question" | "admin"
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),                             // null = unused
  createdAt: timestamp("created_at").defaultNow(),
});

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
  inviteCode: z.string().optional(), // required in production
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, "passwordHash" | "securityAnswerHash" | "failedLoginAttempts" | "lockedUntil" | "workosId" | "googleId" | "replitId">;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

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
  activity: z.string().min(1, "Activity is required"),
  notes: z.string().optional(),
  urgency: z.number().min(1).max(5).optional(),
  impact: z.number().min(1).max(5).optional(),
  effort: z.number().min(1).max(5).optional(),
  prerequisites: z.string().optional(),
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
