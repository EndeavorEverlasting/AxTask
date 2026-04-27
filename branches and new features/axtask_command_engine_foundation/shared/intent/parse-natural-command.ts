import {
  type ParsedCommand,
  type ParseCommandContext,
  parsedCommandSchema,
  unknownCommand,
} from "./intent-types";
import { parseDateTime, stripDateTimePhrases } from "./time-parser";
import { parseRecurrence, stripRecurrencePhrases } from "./recurrence-parser";

function normalize(raw: string): string {
  return raw
    .replace(/^(?:hey\s+)?ax\s*task[,.:!?\s]*/i, "")
    .replace(/^(?:ok(?:ay)?\s+)?ax\s*task[,.:!?\s]*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanActivity(text: string): string {
  return text
    .replace(/\b(?:please|can you|could you)\b/gi, " ")
    .replace(/\b(?:create|add|make|new)\s+(?:a\s+)?(?:new\s+)?(?:task|todo|to-do)\b/gi, " ")
    .replace(/\b(?:remind me to|remind me about|don't forget to|i need to|i have to)\b/gi, " ")
    .replace(/\b(?:called|named|titled)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[.?!]+$/, "");
}

function detectNavigation(normalized: string): ParsedCommand | null {
  const lower = normalized.toLowerCase();

  const targets: Array<[RegExp, string]> = [
    [/\b(?:open|show|go to|navigate to|take me to)\s+(?:the\s+)?(?:dashboard|home)\b/, "/"],
    [/\b(?:open|show|go to|navigate to|take me to)\s+(?:the\s+)?(?:calendar)\b/, "/calendar"],
    [/\b(?:open|show|go to|navigate to|take me to)\s+(?:the\s+)?(?:planner|ai planner)\b/, "/planner"],
    [/\b(?:open|show|go to|navigate to|take me to)\s+(?:the\s+)?(?:tasks?|task list)\b/, "/tasks"],
    [/\b(?:open|show|go to|navigate to|take me to)\s+(?:my\s+)?(?:shopping|grocery)(?:\s+list)?\b/, "/shopping"],
    [/\b(?:open|show|go to|navigate to|take me to)\s+(?:the\s+)?(?:alarms?|reminders?)\b/, "/alarms"],
  ];

  for (const [pattern, target] of targets) {
    if (pattern.test(lower)) {
      return {
        raw: normalized,
        normalized: lower,
        kind: "navigation",
        navigationTarget: target,
        confidence: 0.92,
        needsConfirmation: false,
        warnings: [],
      };
    }
  }

  return null;
}

function detectPlanning(normalized: string): ParsedCommand | null {
  const lower = normalized.toLowerCase();
  const planningPattern =
    /\b(?:help me plan|plan|build a plan for|prepare|draft|summarize|make a report for|help me with)\b/i;

  if (!planningPattern.test(lower)) return null;

  const planningTopic = normalized
    .replace(planningPattern, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    raw: normalized,
    normalized: lower,
    kind: "planning_request",
    planningTopic: planningTopic || normalized,
    confidence: 0.78,
    needsConfirmation: true,
    warnings: [],
  };
}

function detectSearch(normalized: string): ParsedCommand | null {
  const lower = normalized.toLowerCase();
  const match = lower.match(/\b(?:find|search|look for|where is|where are)\b/i);
  if (!match) return null;

  const searchQuery = normalized
    .replace(/\b(?:find|search|look for|where is|where are)\b/gi, " ")
    .replace(/\b(?:my\s+)?(?:tasks?|reminders?|alarms?)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    raw: normalized,
    normalized: lower,
    kind: "search",
    searchQuery: searchQuery || normalized,
    confidence: 0.75,
    needsConfirmation: false,
    warnings: [],
  };
}

function detectTaskReview(normalized: string): ParsedCommand | null {
  const lower = normalized.toLowerCase();
  if (!/\b(?:done|finished|completed|mark|checked off|knocked out)\b/.test(lower)) return null;

  const activity = normalized
    .replace(/\b(?:i\s+)?(?:already\s+)?(?:finished|completed|did|done with|done|checked off|knocked out)\b/gi, " ")
    .replace(/\bmark\b/gi, " ")
    .replace(/\bas\s+(?:done|completed|finished)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    raw: normalized,
    normalized: lower,
    kind: "task_review",
    reviewAction: "complete",
    activity,
    confidence: 0.78,
    needsConfirmation: true,
    warnings: [],
  };
}

function detectAlarmList(normalized: string): ParsedCommand | null {
  const lower = normalized.toLowerCase();
  if (!/\b(?:show|list|what|which|load)\s+(?:my\s+)?alarms?\b/.test(lower)) return null;

  return {
    raw: normalized,
    normalized: lower,
    kind: "alarm_list",
    confidence: 0.9,
    needsConfirmation: false,
    warnings: [],
  };
}

function detectTaskOrReminder(normalized: string, context: ParseCommandContext): ParsedCommand | null {
  const lower = normalized.toLowerCase();
  const recurrence = parseRecurrence(normalized);
  const when = parseDateTime(normalized, context);

  const isReminder =
    /\b(?:remind me|alarm|notify me|ping me)\b/i.test(lower) ||
    /\bat\s+\d{1,2}/i.test(lower);

  const isTask =
    /\b(?:create|add|make|new|task|todo|to-do|i need to|i have to|don't forget to|remind me to)\b/i.test(lower) ||
    recurrence.recurrence !== "none";

  if (!isReminder && !isTask) return null;

  let activitySource = normalized;
  activitySource = stripDateTimePhrases(activitySource);
  activitySource = stripRecurrencePhrases(activitySource);
  const activity = cleanActivity(activitySource);

  const warnings: string[] = [];
  if (!activity) warnings.push("No clear task activity detected.");
  if (when.time && when.confidence < 0.7) warnings.push("Time is ambiguous; confirmation required.");
  if (recurrence.recurrence === "irregular") warnings.push("Irregular recurrence needs product rules before auto-scheduling.");

  const kind =
    recurrence.recurrence && recurrence.recurrence !== "none"
      ? "create_recurring_task"
      : isReminder
        ? "create_reminder"
        : "create_task";

  const confidence = Math.min(
    0.95,
    0.55 +
      (activity ? 0.2 : 0) +
      (when.date ? 0.08 : 0) +
      (when.time ? 0.08 : 0) +
      (recurrence.recurrence && recurrence.recurrence !== "none" ? 0.12 : 0),
  );

  return {
    raw: normalized,
    normalized: lower,
    kind,
    activity,
    date: when.date,
    time: when.time,
    recurrence: recurrence.recurrence,
    confidence,
    needsConfirmation: true,
    warnings,
  };
}

export function parseNaturalCommand(raw: string, context: ParseCommandContext): ParsedCommand {
  const normalizedText = normalize(raw);
  if (!normalizedText) return unknownCommand(raw, "");

  const detectors = [
    detectNavigation,
    detectAlarmList,
    detectTaskReview,
    detectPlanning,
    detectSearch,
  ] as const;

  for (const detector of detectors) {
    const result = detector(normalizedText);
    if (result) return parsedCommandSchema.parse(result);
  }

  const taskOrReminder = detectTaskOrReminder(normalizedText, context);
  if (taskOrReminder) return parsedCommandSchema.parse(taskOrReminder);

  return parsedCommandSchema.parse(unknownCommand(raw, normalizedText.toLowerCase()));
}

export function commandNeedsFullReview(command: ParsedCommand): boolean {
  return command.needsConfirmation || command.confidence < 0.9 || command.warnings.length > 0;
}
