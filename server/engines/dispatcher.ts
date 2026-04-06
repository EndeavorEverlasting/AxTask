import type { Task } from "@shared/schema";
import { classifyCalendarIntent, processCalendarCommand, type CalendarResult } from "./calendar-engine";
import { processPlannerQuery, type PlannerResult } from "./planner-engine";
import { processTaskReview, type ReviewResult } from "./review-engine";

export type IntentType = "task_create" | "planner_query" | "calendar_command" | "navigation" | "search" | "task_review";

export interface EngineResponse {
  intent: IntentType;
  action: string;
  payload: Record<string, unknown>;
  message: string;
}

interface IntentPattern {
  intent: IntentType;
  patterns: RegExp[];
  priority: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: "navigation",
    patterns: [
      /\b(?:go to|open|show me|navigate to|switch to)\s+(?:the\s+)?(?:dashboard|home)\b/i,
      /\b(?:go to|open|show me|navigate to|switch to)\s+(?:the\s+)?(?:tasks?|task list)\b/i,
      /\b(?:go to|open|show me|navigate to|switch to)\s+(?:the\s+)?calendar\b/i,
      /\b(?:go to|open|show me|navigate to|switch to)\s+(?:the\s+)?analytics\b/i,
      /\b(?:go to|open|show me|navigate to|switch to)\s+(?:the\s+)?(?:planner|ai planner)\b/i,
      /\b(?:go to|open|show me|navigate to|switch to)\s+(?:the\s+)?checklist\b/i,
    ],
    priority: 10,
  },
  {
    intent: "task_review",
    patterns: [
      /\b(?:i\s+)?(?:already\s+)?(?:finished|completed|did|done with|done|checked off|knocked out|took care of)\s+/i,
      /\bmark\s+.+?\s+(?:as\s+)?(?:completed?|done|finished)\b/i,
      /\b(?:i(?:'ve| have)\s+)?(?:already\s+)?(?:finished|completed|done)\s+/i,
      /\bbulk\s+(?:complete|update|review)\b/i,
      /\b(?:i\s+)?(?:already\s+)?(?:took care of|handled|wrapped up|cleared)\s+/i,
      /\b(?:i\s+)?(?:finished|completed|did).+(?:and|,).+/i,
      /\b(?:move|reschedule|push)\s+.+?\s+to\s+.+?\s+(?:and|,)\s+/i,
    ],
    priority: 8,
  },
  {
    intent: "task_create",
    patterns: [
      /\b(?:create|add|new|make)\s+(?:a\s+)?(?:new\s+)?task\b/i,
      /\b(?:remind me to|i need to|don't forget to|add)\s+/i,
    ],
    priority: 5,
  },
  {
    intent: "calendar_command",
    patterns: [
      /\b(?:move|reschedule|postpone|push|shift)\s+/i,
      /\bwhat(?:'s| is)\s+(?:on|happening|scheduled)\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)\b/i,
      /\b(?:schedule|book|plan)\s+(?:.*?)\s+(?:on|for)\s+/i,
      /\bwhat do i have\s+(?:on|for)\s+/i,
    ],
    priority: 7,
  },
  {
    intent: "planner_query",
    patterns: [
      /\b(?:what'?s?\s+(?:most\s+)?urgent|highest priority|what.*first|what.*next|important)\b/i,
      /\b(?:overdue|late|missed|past due)\b/i,
      /\b(?:due today|today'?s?|what.*today)\b/i,
      /\b(?:summarize|summary|how.*doing|status|overview)\b/i,
      /\b(?:this week|week|upcoming|weekly)\b/i,
      /\b(?:completed|done|finished)\b/i,
      /\b(?:how many|count|total)\s+(?:tasks?|pending|overdue)\b/i,
    ],
    priority: 3,
  },
  {
    intent: "search",
    patterns: [
      /\b(?:find|search|look for|where is|show)\s+/i,
    ],
    priority: 1,
  },
];

function extractNavigationTarget(text: string): string {
  const lower = text.toLowerCase();
  if (/(?:dashboard|home)\b/.test(lower)) return "/";
  if (/(?:tasks?|task list)\b/.test(lower)) return "/tasks";
  if (/\bcalendar\b/.test(lower)) return "/calendar";
  if (/\banalytics\b/.test(lower)) return "/analytics";
  if (/\b(?:planner|ai planner)\b/.test(lower)) return "/planner";
  if (/\bchecklist\b/.test(lower)) return "/checklist";
  return "/";
}

function extractTaskDetails(text: string): { activity: string; date?: string; time?: string } {
  let activity = text;
  activity = activity.replace(/\b(?:create|add|new|make)\s+(?:a\s+)?(?:new\s+)?task\s*/i, "");
  activity = activity.replace(/\b(?:remind me to|i need to|don't forget to)\s*/i, "");
  activity = activity.replace(/\b(?:called|named|titled)\s*/i, "");

  let date: string | undefined;
  let time: string | undefined;

  const tomorrowMatch = activity.match(/\b(?:for\s+)?tomorrow\b/i);
  const todayMatch = activity.match(/\b(?:for\s+)?today\b/i);
  const daysMatch = activity.match(/\bin\s+(\d+)\s+days?\b/i);

  if (tomorrowMatch) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    date = d.toISOString().split("T")[0];
    activity = activity.replace(/\b(?:for\s+)?tomorrow\b/i, "");
  } else if (todayMatch) {
    date = new Date().toISOString().split("T")[0];
    activity = activity.replace(/\b(?:for\s+)?today\b/i, "");
  } else if (daysMatch) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(daysMatch[1]));
    date = d.toISOString().split("T")[0];
    activity = activity.replace(/\bin\s+\d+\s+days?\b/i, "");
  }

  const timeMatch = activity.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3]?.toLowerCase();
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    activity = activity.replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i, "");
  }

  activity = activity.replace(/\s{2,}/g, " ").trim();

  return { activity, date, time };
}

function extractSearchQuery(text: string): string {
  let query = text;
  query = query.replace(/\b(?:find|search|look for|where is|show)\s*/i, "");
  query = query.replace(/\b(?:tasks?\s+(?:about|called|named|with|containing))\s*/i, "");
  return query.trim();
}

export function classifyIntent(text: string): IntentType {
  const lower = text.toLowerCase().trim();

  let bestIntent: IntentType = "search";
  let bestPriority = -1;

  for (const ip of INTENT_PATTERNS) {
    if (ip.priority > bestPriority) {
      for (const pattern of ip.patterns) {
        if (pattern.test(lower)) {
          bestIntent = ip.intent;
          bestPriority = ip.priority;
          break;
        }
      }
    }
  }

  return bestIntent;
}

export async function dispatchVoiceCommand(
  transcript: string,
  tasks: Task[],
  userId: string,
  todayStr: string,
  now: Date
): Promise<EngineResponse> {
  const intent = classifyIntent(transcript);

  switch (intent) {
    case "navigation": {
      const target = extractNavigationTarget(transcript);
      const pageName = target === "/" ? "Dashboard" : target.slice(1).charAt(0).toUpperCase() + target.slice(2);
      return {
        intent: "navigation",
        action: "navigate",
        payload: { path: target },
        message: `Navigating to ${pageName}.`,
      };
    }

    case "task_create": {
      const details = extractTaskDetails(transcript);
      return {
        intent: "task_create",
        action: "prefill_task",
        payload: {
          activity: details.activity,
          date: details.date || todayStr,
          time: details.time || "",
        },
        message: details.activity
          ? `Ready to create task: "${details.activity}"`
          : "Opening task form for you.",
      };
    }

    case "calendar_command": {
      const calIntent = classifyCalendarIntent(transcript);
      if (calIntent !== "unknown") {
        const result = processCalendarCommand(transcript, tasks, todayStr, now);
        return {
          intent: "calendar_command",
          action: result.action,
          payload: result.payload,
          message: result.message,
        };
      }
      return {
        intent: "calendar_command",
        action: "navigate",
        payload: { path: "/calendar" },
        message: "Opening your calendar.",
      };
    }

    case "planner_query": {
      const result = processPlannerQuery(transcript, tasks, todayStr, now);
      return {
        intent: "planner_query",
        action: result.action,
        payload: { answer: result.answer, relatedTasks: result.relatedTasks },
        message: result.answer,
      };
    }

    case "task_review": {
      const reviewResult = processTaskReview(transcript, tasks, now);
      return {
        intent: "task_review",
        action: "show_review",
        payload: {
          actions: reviewResult.actions,
          unmatched: reviewResult.unmatched,
        },
        message: reviewResult.message,
      };
    }

    case "search":
    default: {
      const query = extractSearchQuery(transcript);
      const pendingTasks = tasks.filter(t => t.status !== "completed");
      const matches = pendingTasks.filter(t =>
        t.activity.toLowerCase().includes(query.toLowerCase()) ||
        (t.notes || "").toLowerCase().includes(query.toLowerCase())
      );
      return {
        intent: "search",
        action: "show_results",
        payload: { query, results: matches.slice(0, 5) },
        message: matches.length > 0
          ? `Found ${matches.length} task${matches.length !== 1 ? "s" : ""} matching "${query}".`
          : `No tasks found matching "${query}".`,
      };
    }
  }
}
