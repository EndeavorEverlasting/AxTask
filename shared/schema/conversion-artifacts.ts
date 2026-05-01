// Conversion artifacts (task bundles) — preserves original prompts when a single
// entry becomes many tasks. Depends on ./core (users) and ./tasks (task FK).

import { sql } from "drizzle-orm";
import { boolean, customType, index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./core";
import { tasks } from "./tasks";

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
  toDriver: (v) => v,
  fromDriver: (v) => v as Buffer,
});

/** Values persisted on `conversion_artifacts.conversion_type` (bundle-creating flows only). */
export const CONVERSION_ARTIFACT_TYPES = ["shopping_list", "checklist", "project_plan", "gantt_plan"] as const;
export type ConversionArtifactType = (typeof CONVERSION_ARTIFACT_TYPES)[number];

export const conversionArtifacts = pgTable(
  "conversion_artifacts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    conversionType: text("conversion_type").notNull(),
    originalActivity: text("original_activity").notNull().default(""),
    originalNotes: text("original_notes").notNull().default(""),
    encrypted: boolean("encrypted").notNull().default(false),
    encryptedPayload: bytea("encrypted_payload"),
    encryptionKeyRef: text("encryption_key_ref"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_conversion_artifacts_user").on(t.userId)],
);

export const conversionArtifactTasks = pgTable(
  "conversion_artifact_tasks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    artifactId: varchar("artifact_id")
      .notNull()
      .references(() => conversionArtifacts.id, { onDelete: "cascade" }),
    taskId: varchar("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("ux_conversion_artifact_tasks_task").on(t.taskId),
    index("idx_conversion_artifact_tasks_artifact_sort").on(t.artifactId, t.sortOrder),
  ],
);

export type ConversionArtifact = typeof conversionArtifacts.$inferSelect;
export type ConversionArtifactTask = typeof conversionArtifactTasks.$inferSelect;

export const conversionArtifactItemSchema = z.object({
  key: z.string().min(1).max(64).optional(),
  activity: z.string().min(1).max(500),
  notes: z.string().max(10_000).optional().default(""),
  classification: z.string().min(1).max(64).optional(),
  startDate: z.string().max(40).optional().nullable(),
  endDate: z.string().max(40).optional().nullable(),
  durationMinutes: z.number().int().min(0).max(60 * 24 * 365).optional().nullable(),
  dependsOn: z.array(z.string().min(1).max(64)).max(32).optional().nullable(),
  dependsOnKeys: z.array(z.string().min(1).max(64)).max(32).optional().nullable(),
  milestone: z.boolean().optional(),
  deadlineType: z
    .enum(["flexible", "hard", "audit-risk", "external", "exam"])
    .optional()
    .nullable(),
});

export const createConversionArtifactBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  conversionType: z.enum(CONVERSION_ARTIFACT_TYPES),
  originalActivity: z.string().max(500).optional().default(""),
  originalNotes: z.string().max(10_000).optional().default(""),
  items: z.array(conversionArtifactItemSchema).min(1).max(500),
  taskDefaults: z
    .object({
      date: z.string().min(1).optional(),
      time: z.string().optional(),
      urgency: z.number().int().min(1).max(5).optional(),
      impact: z.number().int().min(1).max(5).optional(),
      effort: z.number().int().min(1).max(5).optional(),
      visibility: z.enum(["private", "public"]).optional(),
      communityShowNotes: z.boolean().optional(),
    })
    .optional(),
});

export const undoConversionArtifactBodySchema = z.object({
  mode: z.enum(["soft", "hard"]),
});
