import { z } from "zod";

export const axIntentKindSchema = z.enum([
  "create_task",
  "create_reminder",
  "create_recurring_task",
  "planning_request",
  "navigation",
  "search",
  "task_review",
  "alarm_list",
  "unknown",
]);

export type AxIntentKind = z.infer<typeof axIntentKindSchema>;

export const parsedCommandBaseSchema = z.object({
  raw: z.string(),
  normalized: z.string(),
  kind: axIntentKindSchema,
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean().default(true),
  warnings: z.array(z.string()).default([]),
});

export const parsedCommandSchema = parsedCommandBaseSchema.extend({
  activity: z.string().optional(),
  date: z.string().optional(), // YYYY-MM-DD
  time: z.string().optional(), // HH:mm
  recurrence: z
    .enum(["none", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly", "irregular"])
    .optional(),
  navigationTarget: z.string().optional(),
  searchQuery: z.string().optional(),
  planningTopic: z.string().optional(),
  reviewAction: z.enum(["complete", "reschedule", "unknown"]).optional(),
});

export type ParsedCommand = z.infer<typeof parsedCommandSchema>;

export type ParseCommandContext = {
  now: Date;
  todayStr?: string;
  locale?: string;
};

export function unknownCommand(raw: string, normalized = raw.trim().toLowerCase()): ParsedCommand {
  return {
    raw,
    normalized,
    kind: "unknown",
    confidence: 0.1,
    needsConfirmation: true,
    warnings: ["Command could not be classified."],
  };
}
