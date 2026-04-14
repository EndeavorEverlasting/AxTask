/**
 * Client-side voice shortcut matching.
 *
 * Maps spoken phrases to the same actions as keyboard shortcuts (Alt+T, Alt+F, Alt+N).
 * Executes locally — no server round-trip — for instant feedback on mobile.
 *
 * Supports:
 *  - "Hey AxTask" wake-word prefix (stripped before matching)
 *  - Multiple synonyms per shortcut
 *  - Fuzzy phrasing ("show me all my tasks" → dashboard)
 */

export type VoiceShortcutAction = "dashboard" | "find_tasks" | "new_task" | null;

/** Strip "Hey AxTask" (and common variations) from the beginning of a transcript. */
export function stripWakeWord(raw: string): string {
  return raw
    .replace(/^(?:hey\s+)?ax\s*task[,.:!]?\s*/i, "")
    .replace(/^(?:ok(?:ay)?\s+)?ax\s*task[,.:!]?\s*/i, "")
    .trim();
}

/** Returns true if the raw transcript begins with the wake-word prefix. */
export function hasWakeWord(raw: string): boolean {
  return /^(?:(?:hey|ok(?:ay)?)\s+)?ax\s*task\b/i.test(raw.trim());
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
];

/**
 * Match a transcript against voice shortcut patterns.
 * Returns the matched action or null if no match.
 * Automatically strips the "Hey AxTask" wake word before matching.
 */
export function matchVoiceShortcut(rawTranscript: string): VoiceShortcutAction {
  const cleaned = stripWakeWord(rawTranscript).toLowerCase().trim();
  if (!cleaned) return null;

  for (const { action, patterns } of SHORTCUT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(cleaned)) {
        return action;
      }
    }
  }

  return null;
}

/**
 * Human-readable labels for voice shortcut actions (used in UI hint chips).
 */
export const VOICE_SHORTCUT_HINTS = [
  { action: "dashboard" as const, label: "Dashboard", examples: ['"Show all tasks"', '"Go home"'] },
  { action: "find_tasks" as const, label: "Find Tasks", examples: ['"Find a task"', '"Search"'] },
  { action: "new_task" as const, label: "New Task", examples: ['"Add a task"', '"New task"'] },
] as const;

