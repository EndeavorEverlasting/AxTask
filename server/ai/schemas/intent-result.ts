import { z } from "zod";
import { reminderTriggerSchema, TASK_NOTES_MAX_CHARS } from "@shared/schema";

export const aiIntentTypeSchema = z.enum(["create_reminder", "create_task", "clarification"]);
export type AiIntentType = z.infer<typeof aiIntentTypeSchema>;

export const aiCreateReminderPayloadSchema = z.object({
  kind: z.enum(["time", "recurring", "location_event", "location_offset", "hybrid"]),
  taskId: z.string().min(1).max(128).optional(),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional().nullable(),
  enabled: z.boolean().optional(),
  trigger: reminderTriggerSchema,
});

export const aiClarificationPayloadSchema = z.object({
  question: z.string().min(1).max(500),
  reason: z.string().min(1).max(500),
  missingFields: z.array(z.string().min(1).max(64)).default([]),
});

export const aiCreateTaskPayloadSchema = z.object({
  activity: z.string().min(1).max(500),
  notes: z.string().max(TASK_NOTES_MAX_CHARS).optional().nullable(),
  /** ISO calendar date (YYYY-MM-DD); defaults to today in executor when omitted */
  date: z.string().min(10).max(40).optional(),
});

export const aiIntentResultSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_reminder"),
    payload: aiCreateReminderPayloadSchema,
  }),
  z.object({
    type: z.literal("create_task"),
    payload: aiCreateTaskPayloadSchema,
  }),
  z.object({
    type: z.literal("clarification"),
    payload: aiClarificationPayloadSchema,
  }),
]);

export type AiIntentResult = z.infer<typeof aiIntentResultSchema>;

export function buildClarificationIntent(
  question: string,
  reason: string,
  missingFields: string[] = [],
): AiIntentResult {
  return {
    type: "clarification",
    payload: {
      question,
      reason,
      missingFields,
    },
  };
}
