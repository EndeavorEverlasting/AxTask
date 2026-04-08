/**
 * Canonical shortcut labels for AxTask. Keep in sync with key handlers (e.g. App.tsx, sidebar).
 * We avoid browser-tab chords (Ctrl/Cmd+T, Ctrl/Cmd+Shift+T) and document focus expectations in UI copy.
 */
export const KBD = {
  tutorialToggle: "Ctrl+Shift+Y",
  tutorialToggleMac: "Cmd+Shift+Y",
  newTask: "Ctrl+N",
  newTaskMac: "Cmd+N",
  voice: "Ctrl+M",
  voiceMac: "Cmd+M",
  submitTask: "Ctrl+Enter",
  submitTaskMac: "Cmd+Enter",
  sidebar: "Ctrl+Shift+B",
  sidebarMac: "Cmd+Shift+B",
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
