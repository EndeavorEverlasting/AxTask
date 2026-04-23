/**
 * Canonical shortcut labels for AxTask. Keep in sync with key handlers (e.g. App.tsx, sidebar).
 * We avoid browser-tab chords (Ctrl/Cmd+T, Ctrl/Cmd+Shift+T) and document focus expectations in UI copy.
 */
export const KBD = {
  tutorialToggle: "Ctrl+Shift+Y",
  tutorialToggleMac: "Cmd+Shift+Y",
  dashboard: "Alt+T",
  dashboardMac: "Alt+T",
  newTask: "Alt+N",
  newTaskMac: "Alt+N",
  findTasks: "Alt+F",
  findTasksMac: "Alt+F",
  calendar: "Alt+C",
  calendarMac: "Alt+C",
  globalSearch: "Ctrl+F",
  globalSearchMac: "Cmd+F",
  voice: "Ctrl+M",
  voiceMac: "Cmd+M",
  submitTask: "Ctrl+Enter",
  submitTaskMac: "Cmd+Enter",
  /** Windows/Linux: Enter key with Alt; same handler as Ctrl+Enter on the task form. */
  submitTaskAlt: "Alt+Enter",
  /** Physical Backslash key (many layouts: key right of `]`). Matches `matchSidebarChord` in hotkey-actions. */
  sidebar: "Ctrl+Shift+\\",
  sidebarMac: "Cmd+Shift+\\",
  hotkeyHelp: "Ctrl+Shift+/",
  hotkeyHelpMac: "Cmd+Shift+/",
  loginHelp: "Ctrl+Shift+H",
  loginHelpMac: "Cmd+Shift+H",
} as const;

/** Shown in shortcut dialogs and tutorial footers. */
export const SHORTCUT_FOCUS_NOTE =
  "Shortcuts apply when focus is in the app (click the page first). The browser keeps Ctrl+T / Ctrl+Shift+T (Cmd+T / Cmd+Shift+T on Mac) for tabs, so AxTask does not use those keys.";

export function tutorialToggleTitle(): string {
  return `${KBD.tutorialToggle} / ${KBD.tutorialToggleMac}`;
}

/** Human-readable chord list for task form submit (docs, tutorials, settings). */
export const SUBMIT_TASK_SHORTCUTS = `${KBD.submitTask} / ${KBD.submitTaskMac} / ${KBD.submitTaskAlt}`;
