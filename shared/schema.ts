import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull(),
  activity: text("activity").notNull(),
  notes: text("notes").default(""),
  urgency: integer("urgency"), // 1-5 or null for auto-calculation
  impact: integer("impact"), // 1-5 or null for auto-calculation
  effort: integer("effort"), // 1-5 or null for auto-calculation
  prerequisites: text("prerequisites").default(""),
  priority: text("priority").notNull(), // "Highest", "High", "Medium-High", "Medium", "Low"
  priorityScore: integer("priority_score").notNull(),
  classification: text("classification").notNull(), // "Development", "Meeting", "Administrative", etc.
  status: text("status").notNull().default("pending"), // "pending", "in-progress", "completed"
  isRepeated: boolean("is_repeated").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  priority: true,
  priorityScore: true,
  classification: true,
  isRepeated: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  date: z.string().min(1, "Date is required"),
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
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type Task = typeof tasks.$inferSelect;
