/**
 * Shared voice routing helpers (used by server `dispatchVoiceCommand`).
 * Keep navigation targets aligned with client routes / sidebar.
 */

const NAV_LEAD_IN = /\b(?:go to|open|show me|take me to|bring me to|get me to|navigate to|switch to)\b/i;

export function hasNavigationLeadIn(text: string): boolean {
  return NAV_LEAD_IN.test(text);
}

function matchTasksDestination(lower: string): boolean {
  if (/\b(all tasks|task list|my tasks)\b/i.test(lower)) return true;
  if (/\b(completed|pending|overdue|finished|done|in[-\s]?progress)\s+tasks?\b/i.test(lower)) return false;
  return /\btasks?\b/i.test(lower);
}

/** Ordered: first match wins. Use specific multi-word routes before broad terms. */
const VOICE_NAV_TARGETS: Array<{ path: string; test: (lower: string) => boolean }> = [
  { path: "/import-export", test: (l) => /\b(import\s*[&/]?\s*export|import export|backup tasks?|export my tasks?|import my tasks?)\b/i.test(l) },
  { path: "/google-sheets", test: (l) => /\b(google sheets|sheets sync|spreadsheet sync)\b/i.test(l) },
  { path: "/planner", test: (l) => /\b(ai\s+planner|planner)\b/i.test(l) },
  { path: "/calendar", test: (l) => /\bcalendar\b/i.test(l) },
  { path: "/analytics", test: (l) => /\banalytics\b/i.test(l) },
  { path: "/checklist", test: (l) => /\b(checklist|print checklist)\b/i.test(l) },
  { path: "/rewards", test: (l) => /\b(rewards?\s+shop|rewards|axcoins?|skill tree|offline skills|skill upgrades)\b/i.test(l) },
  { path: "/premium", test: (l) => /\bpremium\b/i.test(l) },
  { path: "/billing", test: (l) => /\b(billing|subscription|payments?)\b/i.test(l) },
  { path: "/account", test: (l) => /\b(account|my profile|profile settings)\b/i.test(l) },
  { path: "/feedback", test: (l) => /\bfeedback\b/i.test(l) },
  { path: "/contact", test: (l) => /\bcontact\b/i.test(l) },
  { path: "/admin", test: (l) => /\b(admin|security admin)\b/i.test(l) },
  { path: "/tasks", test: (l) => matchTasksDestination(l) },
  { path: "/", test: (l) => /\b(dashboard|home)\b/i.test(l) },
];

export function matchNavigationPath(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { path, test } of VOICE_NAV_TARGETS) {
    if (test(lower)) return path;
  }
  return null;
}

/** Meta phrases: open task search UI for a follow-up dictation (no query yet). */
export function isMetaOnlyTaskSearchRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!/\b(?:search|find|look for)\b/i.test(lower)) return false;
  let rest = lower.replace(/^\s*(?:find|search|look for|where is|show)\s+/i, "").trim();
  rest = rest.replace(/^i\s+want\s+to\s+(?:search|find)(?:\s+for)?\s*/i, "").trim();
  if (rest.length === 0) return true;
  return /^(?:for\s+)?(?:a\s+)?(?:my\s+)?tasks?$/i.test(rest);
}

export function tryVoiceHelpIntent(transcript: string): { message: string } | null {
  const t = transcript.toLowerCase().trim();
  if (
    /\b(?:what\s+can\s+i\s+say|what\s+commands|commands\s+are\s+available|voice\s+commands?\s+help|help\s+with\s+voice)\b/.test(t) ||
    /^help$/i.test(t.trim()) ||
    /\bhow\s+does\s+voice\s+work\b/.test(t)
  ) {
    return { message: buildVoiceHelpMessage() };
  }
  return null;
}

export function buildVoiceHelpMessage(): string {
  return [
    "Try:",
    "• Navigation: “Take me to the calendar”, “Open import export”, “Go to rewards”.",
    "• New task: “Add a new task” or “Remind me to …”.",
    "• Search: “Search for a task” then say what to find, or “Find report” in one phrase.",
    "• Planner: “What’s due today?”, “Overdue tasks”.",
    "• Tutorial: “Start tutorial” or “Tutorial for calendar”.",
  ].join("\n");
}

export function tryTutorialStartIntent(transcript: string): boolean {
  const t = transcript.toLowerCase().trim();
  return (
    /\b(?:start|restart|begin|open|show)\s+(?:the\s+)?tutorial\b/.test(t) ||
    /\btutorial\s+(?:from\s+)?(?:the\s+)?start\b/.test(t)
  );
}

/** Map natural phrases to tutorial step ids (see client TUTORIAL_STEPS). */
const TUTORIAL_KEYWORD_TO_STEP: Array<{ stepId: string; re: RegExp }> = [
  { stepId: "dashboard", re: /\b(dashboard|home)\b/i },
  { stepId: "planner", re: /\b(planner|ai planner)\b/i },
  { stepId: "task-form", re: /\b(create|add)\s+tasks?\b|\btask\s+form\b|\bnew\s+task\b/i },
  { stepId: "voice-commands", re: /\bvoice\b/i },
  { stepId: "classification", re: /\b(classification|compound interest|axcoins?)\b/i },
  { stepId: "calendar", re: /\bcalendar\b/i },
  { stepId: "analytics", re: /\banalytics\b/i },
  { stepId: "rewards", re: /\b(rewards?|shop|axcoins?)\b/i },
  { stepId: "checklist", re: /\bchecklist\b/i },
  { stepId: "import-export", re: /\b(import|export|backup)\b/i },
  { stepId: "google-sheets", re: /\b(google\s+sheets|sheets)\b/i },
  { stepId: "shortcuts", re: /\b(shortcuts|keyboard)\b/i },
];

export function tryTutorialJumpStepId(transcript: string): string | null {
  const t = transcript.toLowerCase().trim();
  if (
    !/\b(?:the\s+)?tutorial\b/.test(t) &&
    !/\bwalkthrough\b/.test(t) &&
    !/\bwalk\s+me\s+through\b/.test(t)
  ) {
    return null;
  }
  for (const { stepId, re } of TUTORIAL_KEYWORD_TO_STEP) {
    if (re.test(t)) return stepId;
  }
  return null;
}

export interface ModuleGuideHit {
  stepId: string;
  message: string;
}

/** Short answers keyed to tutorial step ids (mirror tutorial copy). */
const MODULE_GUIDE_BY_STEP: Record<string, string> = {
  dashboard: "Dashboard shows stats, deadlines, AxCoins, and quick task entry.",
  planner: "AI Planner gives briefings, recommendations, and a chat about your schedule.",
  calendar: "Calendar shows tasks by date; click a day to add or drag to reschedule.",
  analytics: "Analytics charts priority, classifications, and completion trends.",
  rewards: "Rewards Shop spends AxCoins on themes and badges; Investments shows compound interest.",
  checklist: "Print Checklist builds a PDF for a day; you can scan completed checklists to update tasks.",
  "import-export": "Import/Export backs up tasks and related data, or migrates between accounts.",
  "google-sheets": "Google Sheets sync links a spreadsheet for bulk edits and reporting.",
};

const MODULE_GUIDE_PATTERNS: Array<{ stepId: string; re: RegExp }> = [
  { stepId: "import-export", re: /\bwhat\s+(?:is|does)\s+(?:import|export|backup)\b/i },
  { stepId: "google-sheets", re: /\bwhat\s+(?:is|does)\s+google\s+sheets\b/i },
  { stepId: "rewards", re: /\bwhat\s+(?:are|is)\s+axcoins?\b|\bhow\s+(?:do|does)\s+rewards?\b/i },
  { stepId: "planner", re: /\bwhat\s+(?:is|does)\s+(?:the\s+)?(?:ai\s+)?planner\b/i },
  { stepId: "calendar", re: /\bwhat\s+(?:is|does)\s+(?:the\s+)?calendar\b/i },
  { stepId: "analytics", re: /\bwhat\s+(?:is|does)\s+analytics\b/i },
  { stepId: "checklist", re: /\bwhat\s+(?:is|does)\s+(?:the\s+)?checklist\b/i },
];

export function tryModuleGuideIntent(transcript: string): ModuleGuideHit | null {
  const t = transcript.trim();
  for (const { stepId, re } of MODULE_GUIDE_PATTERNS) {
    if (re.test(t)) {
      const body = MODULE_GUIDE_BY_STEP[stepId];
      if (body) return { stepId, message: body };
    }
  }
  return null;
}
