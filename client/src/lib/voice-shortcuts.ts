/**
 * Client-side voice shortcut matching.
 *
 * Maps spoken phrases to the same actions as keyboard shortcuts (Alt+T, Alt+F, Alt+N, tutorial, help, sidebar, voice).
 * Executes locally — no server round-trip — for instant feedback on mobile.
 */

export type VoiceShortcutAction =
  | "dashboard"
  | "shopping_list"
  | "find_tasks"
  | "new_task"
  | "toggle_tutorial"
  | "toggle_hotkey_help"
  | "toggle_sidebar"
  | "wake_open_voice"
  | "toggle_login_help"
  | null;

/** ASR noise → phrase normalization before pattern matching. */
export function normalizeVoiceShortcutPhrase(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (/^add\s+attention$/i.test(s)) s = "add a task";
  return s;
}

/**
 * Strip wake prefixes: "Hey AxTask", "high AxTask", "OK AxTask", leading "AxTask " or standalone "AxTask".
 */
export function stripWakeWord(raw: string): string {
  let s = raw.trim();
  s = s
    .replace(/^(?:hey|high)\s+ax\s*task[,.:!]?\s*/i, "")
    .replace(/^(?:ok(?:ay)?)\s+ax\s*task[,.:!]?\s*/i, "")
    .replace(/^ax\s*task[,.:!]?\s+/i, "")
    .trim();
  return s;
}

/** True if raw transcript begins with or is a wake phrase (including bare "AxTask"). */
export function hasWakeWord(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/^(?:(?:hey|high|ok(?:ay)?)\s+)?ax\s*task\b/i.test(t)) return true;
  if (/^ax\s*task[,.:!]?\s*$/i.test(t)) return true;
  return false;
}

/** Background wake listener: only react to wake-prefixed speech (reduces accidental triggers). */
export function shouldProcessWakeListenerTranscript(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (hasWakeWord(t)) return true;
  if (/^ax\s*task\b/i.test(t)) return true;
  return false;
}

interface ShortcutPattern {
  action: VoiceShortcutAction;
  patterns: RegExp[];
}

const SHORTCUT_PATTERNS: ShortcutPattern[] = [
  {
    action: "dashboard",
    patterns: [
      /^(?:go\s+(?:to\s+)?)?(?:the\s+)?dashboard$/i,
      /^(?:open|show(?:\s+me)?)\s+(?:the\s+)?dashboard$/i,
      /^(?:show(?:\s+me)?|go\s+(?:to\s+)?|open)\s+(?:all\s+)?(?:my\s+)?tasks$/i,
      /^all\s+tasks$/i,
      /^(?:take\s+me\s+)?home$/i,
      /^(?:go\s+)?home$/i,
      /^(?:show(?:\s+me)?|open)\s+(?:the\s+)?(?:main|home)\s*(?:page|screen)?$/i,
      /^(?:show(?:\s+me)?)\s+everything$/i,
    ],
  },
  {
    action: "shopping_list",
    patterns: [
      /^shopping\s+list$/i,
      /^(?:open|show|go\s+to)\s+(?:me\s+)?(?:my\s+)?(?:shopping|grocery)(?:\s+list)?$/i,
    ],
  },
  {
    action: "find_tasks",
    patterns: [
      /^find\s+(?:a\s+)?tasks?$/i,
      /^search(?:\s+for)?\s+(?:a\s+)?tasks?$/i,
      /^(?:find|search|look\s+for)\s+(?:something|a\s+task|tasks)$/i,
      /^(?:search|find|filter)$/i,
      /^(?:i\s+want\s+to\s+)?(?:find|search|look\s+for)\s+/i,
      /^(?:where(?:'s|\s+is)\s+(?:my\s+)?)/i,
      /^search\s+(?:my\s+)?tasks?$/i,
      /^look(?:\s+(?:for|up))\s+/i,
    ],
  },
  {
    action: "new_task",
    patterns: [
      /^(?:add|create|make|new)\s+(?:a\s+)?(?:new\s+)?task$/i,
      /^(?:add|create)\s+(?:a\s+)?(?:new\s+)?(?:task|item|to-?do)$/i,
      /^new\s+task$/i,
      /^(?:i\s+(?:want|need)\s+to\s+)?(?:add|create)\s+(?:a\s+)?(?:new\s+)?task$/i,
      /^(?:open|show(?:\s+me)?)\s+(?:the\s+)?(?:task\s+)?(?:form|composer|creator|editor)$/i,
      /^(?:add|write)\s+(?:a\s+)?(?:new\s+)?(?:item|entry)$/i,
    ],
  },
  {
    action: "toggle_tutorial",
    patterns: [
      /^toggle\s+tutorial$/i,
      /^(?:start|open|show)\s+(?:the\s+)?tutorial$/i,
      /^(?:stop|close|end)\s+(?:the\s+)?tutorial$/i,
      /^tutorial$/i,
      /^guided\s+tour$/i,
    ],
  },
  {
    action: "toggle_hotkey_help",
    patterns: [
      /^keyboard\s+shortcuts?$/i,
      /^(?:show\s+)?(?:shortcuts?|hotkeys?)$/i,
      /^hotkey\s+help$/i,
      /^shortcut\s+(?:reference|help)$/i,
    ],
  },
  {
    action: "toggle_sidebar",
    patterns: [
      /^toggle\s+sidebar$/i,
      /^(?:show|hide)\s+(?:the\s+)?sidebar$/i,
      /^sidebar$/i,
      /^navigation\s+(?:menu|drawer)$/i,
    ],
  },
  {
    action: "wake_open_voice",
    patterns: [
      /^voice$/i,
      /^(?:open|start)\s+(?:voice|microphone|mic)$/i,
      /^listen$/i,
    ],
  },
  {
    action: "toggle_login_help",
    patterns: [
      /^login\s+help$/i,
      /^sign\s*in\s+help$/i,
      /^help\s+with\s+login$/i,
    ],
  },
];

/**
 * Match a transcript against voice shortcut patterns.
 * Strips wake words before matching. Bare "AxTask" → wake_open_voice.
 */
export function matchVoiceShortcut(rawTranscript: string): VoiceShortcutAction {
  const stripped = stripWakeWord(rawTranscript);
  if (/^ax\s*task[,.:!]?\s*$/i.test(rawTranscript.trim())) {
    return "wake_open_voice";
  }

  const cleaned = normalizeVoiceShortcutPhrase(stripped);
  if (!cleaned) {
    return hasWakeWord(rawTranscript) ? "wake_open_voice" : null;
  }

  for (const { action, patterns } of SHORTCUT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(cleaned)) {
        return action;
      }
    }
  }

  return null;
}

/** Submit/save via voice on the task form (paired with submit hotkeys). */
export function matchTaskFormVoiceSubmit(rawTranscript: string): boolean {
  const t = normalizeVoiceShortcutPhrase(stripWakeWord(rawTranscript));
  return /^(submit|save(\s+task)?|send(\s+it)?)$/i.test(t);
}

/**
 * Human-readable labels for voice shortcut actions (used in UI hint chips).
 */
export const VOICE_SHORTCUT_HINTS = [
  { action: "dashboard" as const, label: "Dashboard", examples: ['"Show all tasks"', '"Go home"'] },
  { action: "shopping_list" as const, label: "Shopping list", examples: ['"Shopping list"', '"Open shopping list"'] },
  { action: "find_tasks" as const, label: "Find Tasks", examples: ['"Find a task"', '"Search"'] },
  { action: "new_task" as const, label: "New Task", examples: ['"Add a task"', '"New task"'] },
  { action: "toggle_tutorial" as const, label: "Tutorial", examples: ['"Toggle tutorial"', '"Guided tour"'] },
  { action: "toggle_hotkey_help" as const, label: "Shortcuts", examples: ['"Keyboard shortcuts"', '"Hotkeys"'] },
  { action: "toggle_sidebar" as const, label: "Sidebar", examples: ['"Toggle sidebar"', '"Navigation"'] },
  { action: "wake_open_voice" as const, label: "Voice", examples: ['"AxTask"', '"Start voice"'] },
  { action: "toggle_login_help" as const, label: "Login help", examples: ['"Login help"'] },
] as const;
