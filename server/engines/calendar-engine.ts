import type { Task } from "@shared/schema";

export type CalendarIntent = "reschedule" | "query_by_date" | "create_on_date" | "unknown";

export interface CalendarResult {
  action: string;
  payload: Record<string, unknown>;
  message: string;
}

const DAY_NAMES: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function resolveDay(dayName: string, now: Date): string {
  const lower = dayName.toLowerCase();
  if (lower === "today") return now.toISOString().split("T")[0];
  if (lower === "tomorrow") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  const targetDay = DAY_NAMES[lower];
  if (targetDay !== undefined) {
    const currentDay = now.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split("T")[0];
  }

  return now.toISOString().split("T")[0];
}

const dayPattern = /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)/i;

export function classifyCalendarIntent(text: string): CalendarIntent {
  const lower = text.toLowerCase();

  if (/\b(?:move|reschedule|postpone|push|shift)\s+/i.test(lower)) {
    return "reschedule";
  }

  if (/\b(?:what(?:'s| is)|what do i have|anything)\s+(?:on|happening|scheduled|for)\b/i.test(lower)) {
    return "query_by_date";
  }

  if (/\b(?:schedule|book|plan|add)\s+(?:.*?)\s+(?:on|for)\s+/i.test(lower)) {
    return "create_on_date";
  }

  return "unknown";
}

export function processCalendarCommand(
  text: string,
  tasks: Task[],
  todayStr: string,
  now: Date
): CalendarResult {
  const intent = classifyCalendarIntent(text);

  switch (intent) {
    case "reschedule": {
      const dayMatch = text.match(new RegExp(`\\bto\\s+(${dayPattern.source})\\b`, "i"));
      const targetDay = dayMatch ? dayMatch[1] : null;
      const targetDate = targetDay ? resolveDay(targetDay, now) : null;

      const taskRef = text
        .replace(/\b(?:move|reschedule|postpone|push|shift)\s+/i, "")
        .replace(/\b(?:my|the|a)\s+/i, "")
        .replace(new RegExp(`\\bto\\s+${dayPattern.source}\\b`, "i"), "")
        .replace(/\s{2,}/g, " ")
        .trim();

      const pendingTasks = tasks.filter(t => t.status !== "completed");
      const matchedTask = taskRef
        ? pendingTasks.find(t => t.activity.toLowerCase().includes(taskRef.toLowerCase()))
        : null;

      if (matchedTask && targetDate) {
        return {
          action: "reschedule_task",
          payload: { taskId: matchedTask.id, newDate: targetDate, taskActivity: matchedTask.activity },
          message: `Moving "${matchedTask.activity}" to ${targetDate}.`,
        };
      }

      if (targetDate && !matchedTask && taskRef) {
        return {
          action: "reschedule_prompt",
          payload: { query: taskRef, targetDate },
          message: `I couldn't find a task matching "${taskRef}". Try a different name.`,
        };
      }

      return {
        action: "navigate",
        payload: { path: "/calendar" },
        message: "Please specify which task and the target day. For example: 'Move dentist to Friday'.",
      };
    }

    case "query_by_date": {
      const dayMatch = text.match(new RegExp(`(?:on|for)\\s+(${dayPattern.source})`, "i"));
      const targetDay = dayMatch ? dayMatch[1] : "today";
      const targetDate = resolveDay(targetDay, now);

      const dayTasks = tasks.filter(t => t.date === targetDate && t.status !== "completed");

      if (dayTasks.length === 0) {
        return {
          action: "show_answer",
          payload: { answer: `No tasks scheduled for ${targetDay}.`, relatedTasks: [] },
          message: `No tasks scheduled for ${targetDay}.`,
        };
      }

      const list = dayTasks
        .slice(0, 5)
        .map((t, i) => `${i + 1}. ${t.activity}${t.time ? ` at ${t.time}` : ""}`)
        .join("\n");

      return {
        action: "show_answer",
        payload: { answer: `Tasks for ${targetDay} (${targetDate}):\n${list}`, relatedTasks: dayTasks.slice(0, 5) },
        message: `You have ${dayTasks.length} task${dayTasks.length !== 1 ? "s" : ""} on ${targetDay}:\n${list}`,
      };
    }

    case "create_on_date": {
      const dayMatch = text.match(new RegExp(`(?:on|for)\\s+(${dayPattern.source})`, "i"));
      const targetDay = dayMatch ? dayMatch[1] : "today";
      const targetDate = resolveDay(targetDay, now);

      let activity = text
        .replace(/\b(?:schedule|book|plan|add)\s+/i, "")
        .replace(/\b(?:a\s+)?(?:task\s+)?(?:to\s+)?/i, "")
        .replace(new RegExp(`(?:on|for)\\s+${dayPattern.source}`, "i"), "")
        .replace(/\s{2,}/g, " ")
        .trim();

      return {
        action: "prefill_task",
        payload: { activity, date: targetDate },
        message: activity
          ? `Creating "${activity}" on ${targetDate}.`
          : `Opening task form for ${targetDate}.`,
      };
    }

    default:
      return {
        action: "navigate",
        payload: { path: "/calendar" },
        message: "Opening your calendar.",
      };
  }
}
