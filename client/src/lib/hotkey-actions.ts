/**
 * Pure keyboard chord → action mapping. Used by App, Sidebar, VoiceProvider, LoginHelpOverlay, TaskForm.
 * Physical sidebar chord is Ctrl/Cmd+Shift+Backslash (not KeyB) — see KBD.sidebar labels in keyboard-shortcuts.ts.
 */

export type HotkeyMatch =
  | { kind: "navigate"; path: string; postEvents?: { name: string; delayMs: number }[] }
  | { kind: "toggleHotkeyHelp" }
  | { kind: "toggleTutorial" }
  | { kind: "toggleSidebar" }
  | { kind: "toggleLoginHelp" }
  | { kind: "voiceToggleListening" }
  | { kind: "voiceCloseBar" }
  | { kind: "closeHotkeyHelp" }
  | { kind: "closeMobileNav" }
  | { kind: "submitTask" };

export interface HotkeyMatchContext {
  hotkeyHelpOpen: boolean;
  /** Set by VoiceProvider so App can route Escape without subscribing to voice context. */
  isVoiceBarOpen: boolean;
}

/** Updated by VoiceProvider each render when the voice command bar is open. */
export const voiceBarOpenRef: { current: boolean } = { current: false };

export function matchAltNavigationHotkey(e: KeyboardEvent): HotkeyMatch | null {
  if (!e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "t") return { kind: "navigate", path: "/" };
  if (k === "n") {
    return {
      kind: "navigate",
      path: "/tasks",
      postEvents: [{ name: "axtask-open-new-task", delayMs: 50 }],
    };
  }
  if (k === "f") {
    return {
      kind: "navigate",
      path: "/tasks",
      postEvents: [{ name: "axtask-focus-task-search", delayMs: 50 }],
    };
  }
  return null;
}

export function matchToggleHotkeyHelpChord(e: KeyboardEvent): HotkeyMatch | null {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Slash") {
    return { kind: "toggleHotkeyHelp" };
  }
  return null;
}

export function matchToggleTutorialChord(e: KeyboardEvent): HotkeyMatch | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.shiftKey && (e.ctrlKey || e.metaKey) && k === "y") {
    return { kind: "toggleTutorial" };
  }
  return null;
}

export function matchSidebarChord(e: KeyboardEvent): HotkeyMatch | null {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Backslash") {
    return { kind: "toggleSidebar" };
  }
  return null;
}

export function matchVoiceMicChord(e: KeyboardEvent): HotkeyMatch | null {
  if ((e.ctrlKey || e.metaKey) && e.key === "m") {
    return { kind: "voiceToggleListening" };
  }
  return null;
}

export function matchLoginHelpChord(e: KeyboardEvent): HotkeyMatch | null {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "h") {
    return { kind: "toggleLoginHelp" };
  }
  return null;
}

export function matchEscapeHotkey(e: KeyboardEvent, ctx: HotkeyMatchContext): HotkeyMatch | null {
  if (e.key !== "Escape" || e.repeat) return null;
  if (e.isComposing) return null;
  if (ctx.isVoiceBarOpen) return { kind: "voiceCloseBar" };
  if (ctx.hotkeyHelpOpen) return { kind: "closeHotkeyHelp" };
  return { kind: "closeMobileNav" };
}

/**
 * Alt+T/N/F, Ctrl+Shift+/, Ctrl+Shift+Y, Escape (with voice bar ref in ctx).
 * Does not include sidebar, voice mic, or login — those use dedicated matchers in their components.
 */
export function matchHotkeyFromKeyboardEvent(
  e: KeyboardEvent,
  ctx: HotkeyMatchContext,
): HotkeyMatch | null {
  const esc = matchEscapeHotkey(e, ctx);
  if (esc) return esc;

  const alt = matchAltNavigationHotkey(e);
  if (alt) return alt;

  const help = matchToggleHotkeyHelpChord(e);
  if (help) return help;

  const tut = matchToggleTutorialChord(e);
  if (tut) return tut;

  return null;
}

/** Task form: Enter with Alt/Ctrl/Meta submits (matches task-form.tsx). */
export function matchTaskFormSubmitHotkey(e: KeyboardEvent): boolean {
  if (e.key !== "Enter") return false;
  return e.altKey || e.ctrlKey || e.metaKey;
}
