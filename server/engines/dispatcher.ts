import type { Task } from "@shared/schema";
import {
  extractShoppingListItemsForVoice,
  isShoppingVoiceUtterance,
  SHOPPING_LIST_MAX_ITEMS,
  stripAvatarDelegationPhrase,
  stripTrailingShoppingListFromActivity,
} from "@shared/shopping-tasks";
import { classifyCalendarIntent, processCalendarCommand, type CalendarResult } from "./calendar-engine";
import { processPlannerQuery, type PlannerResult } from "./planner-engine";
import { isTaskReviewIntent, processTaskReview, type ReviewResult } from "./review-engine";

export type IntentType =
  | "task_create"
  | "planner_query"
  | "calendar_command"
  | "navigation"
  | "search"
  | "task_review"
  | "alarm_config";

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
      /\b(?:go to|open|show|show me|navigate to|switch to|take me to)\s+(?:the\s+)?(?:my\s+)?(?:shopping|grocery)(?:\s+list)?\b/i,
      /\b(?:show|open)\s+(?:me\s+)?(?:my\s+)?(?:shopping|grocery)(?:\s+list)?\b/i,
      /\b(?:go to|open|show me|navigate to|switch to|take me to)\s+(?:the\s+)?(?:dashboard|home)\b/i,
      /\b(?:go to|open|show me|navigate to|switch to|take me to)\s+(?:the\s+)?(?:tasks?|task list|all tasks)\b/i,
      /\b(?:go to|open|show me|navigate to|switch to|take me to)\s+(?:the\s+)?calendar\b/i,
      /\b(?:go to|open|show me|navigate to|switch to|take me to)\s+(?:the\s+)?analytics\b/i,
      /\b(?:go to|open|show me|navigate to|switch to|take me to)\s+(?:the\s+)?(?:planner|ai planner)\b/i,
      /\b(?:go to|open|show me|navigate to|switch to|take me to)\s+(?:the\s+)?checklist\b/i,
      /^(?:hey\s+)?ax\s*task[,.:!]?\s+(?:go\s+(?:to\s+)?|open\s+|show\s+)/i,
      /\bshow\s+(?:me\s+)?(?:all\s+)?(?:my\s+)?tasks\b/i,
      /\ball\s+tasks\b/i,
      /\b(?:go|take me)\s+home\b/i,
      /\bshow\s+(?:me\s+)?everything\b/i,
    ],
    priority: 10,
  },
  {
    intent: "alarm_config",
    patterns: [
      /\b(?:set|create|add|schedule)\s+(?:an?\s+)?alarm\b/i,
      /\balarm\s+(?:for|on)\s+/i,
      /\b(?:wake\s+me\s+up|remind\s+me\s+at)\b/i,
      /\bremind\s+me\s+(?:for|about)\b/i,
      /\bsnooze\b/i,
      /\b(?:list|show)\s+(?:my\s+)?alarms\b/i,
      /\b(?:what|which)\s+alarms\b/i,
      /\bload\s+(?:my\s+)?alarm\b/i,
    ],
    priority: 9,
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
      /\bnew\s+(?:task|item|to-?do)\b/i,
      /\b(?:write|add)\s+(?:a\s+)?(?:new\s+)?(?:item|entry)\b/i,
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
      /\b(?:find|search|look for|where is)\s+/i,
      /\bwhere(?:'s|\s+is)\s+(?:my\s+)?/i,
      /\blook\s+(?:for|up)\s+/i,
      /\bi\s+(?:want|need)\s+to\s+find\b/i,
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
  if (/\b(shopping|grocery)\s+list\b/.test(lower)) return "/shopping";
  if (/\b(?:open|show|go to|navigate to)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(?:shopping|grocery)\b/.test(lower))
    return "/shopping";
  if (/\bchecklist\b/.test(lower)) return "/checklist";
  return "/";
}

function voiceAck(message: string, delegation: boolean): string {
  if (!delegation) return message;
  return `On it — ${message}`;
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

function extractAlarmDateTime(text: string, now: Date): { date: string; time: string } {
  const lower = text.toLowerCase();
  let date = now.toISOString().split("T")[0];
  if (/\btomorrow\b/i.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    date = d.toISOString().split("T")[0];
  }
  const time12 = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (time12) {
    let hours = parseInt(time12[1], 10);
    const minutes = time12[2] ? parseInt(time12[2], 10) : 0;
    const period = time12[3].toLowerCase();
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    return { date, time };
  }
  const time24 = text.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
  if (time24) {
    const hours = parseInt(time24[1], 10);
    const minutes = parseInt(time24[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { date, time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` };
    }
  }
  return { date, time: "09:00" };
}

function extractAlarmTaskQuery(text: string): string {
  const stripped = text
    .replace(/\b(?:set|create|add|schedule)\s+(?:an?\s+)?alarm\b/gi, "")
    .replace(/\b(?:wake\s+me\s+up|remind\s+me\s+at|remind\s+me\s+(?:for|about))\b/gi, "")
    .replace(/\bsnooze\b/gi, "")
    .replace(/\b(?:for|on)\b/gi, " ")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
    .replace(/\bat\s+\d{1,2}:\d{2}\b/gi, "")
    .replace(/\b(?:today|tomorrow)\b/gi, "")
    .trim();
  return stripped.replace(/\s{2,}/g, " ").trim();
}

/** Strip "Hey AxTask" / "OK AxTask" wake word prefix from transcripts. */
function stripWakeWord(text: string): string {
  return text
    .replace(/^(?:hey\s+)?ax\s*task[,.:!]?\s*/i, "")
    .replace(/^(?:ok(?:ay)?\s+)?ax\s*task[,.:!]?\s*/i, "")
    .trim();
}

export function classifyIntent(text: string): IntentType {
  const lower = stripWakeWord(text).toLowerCase().trim();

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
  rawTranscript: string,
  tasks: Task[],
  userId: string,
  todayStr: string,
  now: Date
): Promise<EngineResponse> {
  const afterWake = stripWakeWord(rawTranscript);
  const { text: delegated, delegation } = stripAvatarDelegationPhrase(afterWake);
  const intent = classifyIntent(delegated);

  switch (intent) {
    case "navigation": {
      const target = extractNavigationTarget(delegated);
      const pageName =
        target === "/"
          ? "Dashboard"
          : target === "/shopping"
            ? "Shopping list"
            : target.slice(1).charAt(0).toUpperCase() + target.slice(2);
      return {
        intent: "navigation",
        action: "navigate",
        payload: { path: target },
        message: voiceAck(`Navigating to ${pageName}.`, delegation),
      };
    }

    case "task_create": {
      const lower = delegated.toLowerCase();
      if (isShoppingVoiceUtterance(lower)) {
        let items = extractShoppingListItemsForVoice(delegated);
        if (items.length === 0) {
          const details = extractTaskDetails(delegated);
          const act = stripTrailingShoppingListFromActivity(details.activity).replace(/\s{2,}/g, " ").trim();
          if (act) items = [act];
        }
        if (items.length > 0) {
          const details = extractTaskDetails(delegated);
          const date = details.date || todayStr;
          const time = details.time || "";
          const capped = items.slice(0, SHOPPING_LIST_MAX_ITEMS);
          const msg =
            capped.length === 1
              ? `Adding "${capped[0]}" to your shopping list.`
              : `Adding ${capped.length} items to your shopping list.`;
          return {
            intent: "task_create",
            action: "create_shopping_tasks",
            payload: { items: capped, date, time },
            message: voiceAck(msg, delegation),
          };
        }
      }

      const details = extractTaskDetails(delegated);
      return {
        intent: "task_create",
        action: "prefill_task",
        payload: {
          activity: details.activity,
          date: details.date || todayStr,
          time: details.time || "",
        },
        message: voiceAck(
          details.activity ? `Ready to create task: "${details.activity}"` : "Opening task form for you.",
          delegation,
        ),
      };
    }

    case "calendar_command": {
      const calIntent = classifyCalendarIntent(delegated);
      if (calIntent !== "unknown") {
        const result = processCalendarCommand(delegated, tasks, todayStr, now);
        return {
          intent: "calendar_command",
          action: result.action,
          payload: result.payload,
          message: voiceAck(result.message, delegation),
        };
      }
      return {
        intent: "calendar_command",
        action: "navigate",
        payload: { path: "/calendar" },
        message: voiceAck("Opening your calendar.", delegation),
      };
    }

    case "planner_query": {
      const result = processPlannerQuery(delegated, tasks, todayStr, now);
      return {
        intent: "planner_query",
        action: result.action,
        payload: { answer: result.answer, relatedTasks: result.relatedTasks },
        message: voiceAck(result.answer, delegation),
      };
    }

    case "task_review": {
      const reviewResult = processTaskReview(delegated, tasks, now);
      return {
        intent: "task_review",
        action: "show_review",
        payload: {
          actions: reviewResult.actions,
          unmatched: reviewResult.unmatched,
        },
        message: voiceAck(reviewResult.message, delegation),
      };
    }

    case "alarm_config": {
      const lower = delegated.toLowerCase();
      if (/\bsnooze\b/.test(lower)) {
        return {
          intent: "alarm_config",
          action: "alarm_open_panel",
          payload: {},
          message: voiceAck("Opening alarms — pick a task and new time.", delegation),
        };
      }
      if (/\b(?:list|show|what|which)\s+(?:my\s+)?alarms\b/.test(lower)) {
        return {
          intent: "alarm_config",
          action: "alarm_list",
          payload: {},
          message: voiceAck("Loading your saved alarms.", delegation),
        };
      }
      if (/\bload\s+(?:my\s+)?alarm\b/.test(lower)) {
        return {
          intent: "alarm_config",
          action: "alarm_load",
          payload: {},
          message: voiceAck("Loading your latest alarm snapshot.", delegation),
        };
      }
      const query = extractAlarmTaskQuery(delegated);
      const fallbackTask = tasks.find((t) => t.status !== "completed");
      const matchedTask =
        tasks.find((t) => t.activity.toLowerCase().includes(query.toLowerCase())) ?? fallbackTask;
      if (!matchedTask) {
        return {
          intent: "alarm_config",
          action: "alarm_open_panel",
          payload: {},
          message: voiceAck("Open alarm panel so I can map this to a task.", delegation),
        };
      }
      const parsed = extractAlarmDateTime(delegated, now);
      return {
        intent: "alarm_config",
        action: "alarm_create_for_task",
        payload: {
          taskId: matchedTask.id,
          taskActivity: matchedTask.activity,
          alarmDate: parsed.date,
          alarmTime: parsed.time,
        },
        message: voiceAck(`Preparing alarm for "${matchedTask.activity}".`, delegation),
      };
    }

    case "search":
    default: {
      const query = extractSearchQuery(delegated);
      const pendingTasks = tasks.filter(t => t.status !== "completed");
      const matches = pendingTasks.filter(t =>
        t.activity.toLowerCase().includes(query.toLowerCase()) ||
        (t.notes || "").toLowerCase().includes(query.toLowerCase())
      );
      const searchMsg =
        matches.length > 0
          ? `Found ${matches.length} task${matches.length !== 1 ? "s" : ""} matching "${query}".`
          : `No tasks found matching "${query}".`;
      return {
        intent: "search",
        action: "show_results",
        payload: { query, results: matches.slice(0, 5) },
        message: voiceAck(searchMsg, delegation),
      };
    }
  }
}
