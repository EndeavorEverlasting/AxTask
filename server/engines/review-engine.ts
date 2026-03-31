import type { Task } from "@shared/schema";

export interface ReviewAction {
  type: "complete" | "reschedule" | "update";
  taskId: string;
  taskActivity: string;
  details: Record<string, unknown>;
  confidence: number;
  reason: string;
}

export interface ReviewResult {
  actions: ReviewAction[];
  unmatched: string[];
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
  if (lower === "next week") {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
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

function fuzzyMatch(needle: string, haystack: string): number {
  const n = needle.toLowerCase().trim();
  const h = haystack.toLowerCase().trim();
  if (h === n) return 1.0;
  if (h.includes(n)) return 0.9;
  if (n.includes(h)) return 0.85;

  const nWords = n.split(/\s+/);
  const hWords = h.split(/\s+/);
  let matchCount = 0;
  for (const nw of nWords) {
    if (nw.length < 3) continue;
    if (hWords.some(hw => hw.includes(nw) || nw.includes(hw))) {
      matchCount++;
    }
  }
  const significantWords = nWords.filter(w => w.length >= 3).length;
  if (significantWords === 0) return 0;
  return matchCount / significantWords * 0.8;
}

function findBestTask(ref: string, tasks: Task[]): { task: Task; confidence: number } | null {
  let best: Task | null = null;
  let bestScore = 0;

  for (const task of tasks) {
    const score = Math.max(
      fuzzyMatch(ref, task.activity),
      task.notes ? fuzzyMatch(ref, task.notes) * 0.7 : 0
    );
    if (score > bestScore && score >= 0.3) {
      bestScore = score;
      best = task;
    }
  }

  return best ? { task: best, confidence: bestScore } : null;
}

const COMPLETION_PATTERNS = [
  /\b(?:i\s+)?(?:already\s+)?(?:finished|completed|did|done with|done|checked off|knocked out|took care of)\s+(?:the\s+)?(.+?)(?:\s*(?:,\s*and\s+|,\s*|\s+and\s+)(?:also\s+)?(?:finished|completed|did|done with|done|checked off|knocked out|took care of)\s+(?:the\s+)?(.+?))*$/i,
  /\b(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:completed?|done|finished)\b/i,
  /\b(?:i(?:'ve| have)\s+)?(?:already\s+)?(?:finished|completed|done)\s+(.+?)$/i,
];

const RESCHEDULE_PATTERNS = [
  /\b(?:move|reschedule|push|postpone|shift|change)\s+(?:the\s+)?(.+?)\s+to\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next week)\b/i,
  /\b(?:the\s+)?(.+?)\s+(?:should be|needs to be|can be)\s+(?:moved|rescheduled|pushed)\s+to\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next week)\b/i,
];

const PRIORITY_PATTERNS = [
  /\b(?:make|set|change)\s+(?:the\s+)?(.+?)\s+(?:to\s+)?(?:priority\s+)?(highest|high|medium|low|lowest)\b/i,
  /\b(?:the\s+)?(.+?)\s+(?:is|should be)\s+(?:priority\s+)?(highest|high|medium|low|lowest)\b/i,
];

function splitTaskReferences(text: string): string[] {
  return text
    .split(/\s*(?:,\s*and\s+|,\s*|\s+and\s+)\s*/i)
    .map(s => s.replace(/^(?:the|my|a)\s+/i, "").trim())
    .filter(s => s.length > 0);
}

export function processTaskReview(
  transcript: string,
  tasks: Task[],
  now: Date
): ReviewResult {
  const pendingTasks = tasks.filter(t => t.status !== "completed");
  const actions: ReviewAction[] = [];
  const unmatched: string[] = [];
  const processedTaskIds = new Set<string>();

  const sentences = transcript
    .split(/[.;!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const sentence of sentences) {
    let handled = false;

    for (const pattern of RESCHEDULE_PATTERNS) {
      const match = sentence.match(pattern);
      if (match) {
        const taskRef = match[1].trim();
        const targetDay = match[2];
        const newDate = resolveDay(targetDay, now);
        const result = findBestTask(taskRef, pendingTasks);
        if (result && !processedTaskIds.has(result.task.id)) {
          processedTaskIds.add(result.task.id);
          actions.push({
            type: "reschedule",
            taskId: result.task.id,
            taskActivity: result.task.activity,
            details: { newDate, fromDate: result.task.date },
            confidence: result.confidence,
            reason: `Move to ${targetDay} (${newDate})`,
          });
        } else if (!result) {
          unmatched.push(taskRef);
        }
        handled = true;
        break;
      }
    }
    if (handled) continue;

    for (const pattern of PRIORITY_PATTERNS) {
      const match = sentence.match(pattern);
      if (match) {
        const taskRef = match[1].trim();
        const newPriority = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
        const result = findBestTask(taskRef, pendingTasks);
        if (result && !processedTaskIds.has(result.task.id)) {
          processedTaskIds.add(result.task.id);
          actions.push({
            type: "update",
            taskId: result.task.id,
            taskActivity: result.task.activity,
            details: { priority: newPriority, fromPriority: result.task.priority },
            confidence: result.confidence,
            reason: `Change priority to ${newPriority}`,
          });
        } else if (!result) {
          unmatched.push(taskRef);
        }
        handled = true;
        break;
      }
    }
    if (handled) continue;

    for (const pattern of COMPLETION_PATTERNS) {
      const match = sentence.match(pattern);
      if (match) {
        const groups = Array.from(match).slice(1).filter(Boolean);
        const allRefs: string[] = [];
        for (const group of groups) {
          allRefs.push(...splitTaskReferences(group));
        }
        for (const ref of allRefs) {
          const cleaned = ref
            .replace(/\b(?:already|also|too|as well)\b/gi, "")
            .trim();
          if (!cleaned) continue;
          const result = findBestTask(cleaned, pendingTasks);
          if (result && !processedTaskIds.has(result.task.id)) {
            processedTaskIds.add(result.task.id);
            actions.push({
              type: "complete",
              taskId: result.task.id,
              taskActivity: result.task.activity,
              details: {},
              confidence: result.confidence,
              reason: "Mark as completed",
            });
          } else if (!result) {
            unmatched.push(cleaned);
          }
        }
        handled = true;
        break;
      }
    }
    if (handled) continue;

    const fallbackRefs = splitTaskReferences(sentence);
    for (const ref of fallbackRefs) {
      const cleaned = ref
        .replace(/\b(?:i\s+)?(?:already\s+)?(?:finished|completed|did|done)\b/gi, "")
        .replace(/^(?:the|my|a)\s+/i, "")
        .trim();
      if (cleaned.length < 3) continue;
      const result = findBestTask(cleaned, pendingTasks);
      if (result && !processedTaskIds.has(result.task.id)) {
        processedTaskIds.add(result.task.id);
        actions.push({
          type: "complete",
          taskId: result.task.id,
          taskActivity: result.task.activity,
          details: {},
          confidence: result.confidence,
          reason: "Mark as completed",
        });
      }
    }
  }

  const completeCount = actions.filter(a => a.type === "complete").length;
  const rescheduleCount = actions.filter(a => a.type === "reschedule").length;
  const updateCount = actions.filter(a => a.type === "update").length;

  const parts: string[] = [];
  if (completeCount > 0) parts.push(`${completeCount} to complete`);
  if (rescheduleCount > 0) parts.push(`${rescheduleCount} to reschedule`);
  if (updateCount > 0) parts.push(`${updateCount} to update`);

  let message = "";
  if (actions.length === 0) {
    message = unmatched.length > 0
      ? `I couldn't find tasks matching: ${unmatched.map(u => `"${u}"`).join(", ")}. Try using more specific task names.`
      : "I didn't catch any task updates in that. Try saying something like 'I finished the dentist appointment' or 'move groceries to Friday'.";
  } else {
    message = `Found ${actions.length} proposed change${actions.length !== 1 ? "s" : ""}: ${parts.join(", ")}.`;
    if (unmatched.length > 0) {
      message += ` Couldn't match: ${unmatched.map(u => `"${u}"`).join(", ")}.`;
    }
  }

  return { actions, unmatched, message };
}

export function isTaskReviewIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return !!(
    lower.match(/\b(?:i\s+)?(?:already\s+)?(?:finished|completed|did|done with|done|checked off|knocked out|took care of)\b/) ||
    lower.match(/\bmark\s+.+?\s+(?:as\s+)?(?:completed?|done|finished)\b/) ||
    lower.match(/\b(?:i(?:'ve| have)\s+)?(?:already\s+)?(?:finished|completed|done)\s+.+/) ||
    lower.match(/\b(?:move|reschedule|push|postpone)\s+.+?\s+to\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next week)\b/) ||
    lower.match(/\b(?:make|set|change)\s+.+?\s+(?:to\s+)?(?:priority\s+)?(?:highest|high|medium|low|lowest)\b/) ||
    lower.match(/\bbulk\s+(?:complete|update|review)\b/) ||
    lower.match(/\b(?:i\s+)?(?:already\s+)?(?:took care of|handled|wrapped up|cleared)\b/)
  );
}
