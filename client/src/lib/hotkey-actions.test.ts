import { describe, expect, it } from "vitest";
import {
  matchAltNavigationHotkey,
  matchEscapeHotkey,
  matchGlobalSearchChord,
  matchHotkeyFromKeyboardEvent,
  matchLoginHelpChord,
  matchSidebarChord,
  matchTaskFormSubmitHotkey,
  matchToggleHotkeyHelpChord,
  matchToggleTutorialChord,
  matchVoiceMicChord,
} from "./hotkey-actions";

function key(ev: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: ev.key,
    code: ev.code,
    altKey: ev.altKey,
    ctrlKey: ev.ctrlKey,
    metaKey: ev.metaKey,
    shiftKey: ev.shiftKey,
    repeat: ev.repeat,
  });
}

const ctx = (hotkeyHelpOpen: boolean, isVoiceBarOpen: boolean) => ({
  hotkeyHelpOpen,
  isVoiceBarOpen,
});

describe("KBD.dashboard / Alt+T", () => {
  it("matchAltNavigationHotkey navigates to /", () => {
    expect(matchAltNavigationHotkey(key({ key: "t", altKey: true }))).toEqual({
      kind: "navigate",
      path: "/",
    });
  });

  it("matchHotkeyFromKeyboardEvent returns navigate for Alt+T", () => {
    expect(matchHotkeyFromKeyboardEvent(key({ key: "t", altKey: true }), ctx(false, false))).toEqual({
      kind: "navigate",
      path: "/",
    });
  });
});

describe("KBD.newTask / Alt+N", () => {
  it("matchAltNavigationHotkey opens /tasks with axtask-open-new-task", () => {
    expect(matchAltNavigationHotkey(key({ key: "n", altKey: true }))).toEqual({
      kind: "navigate",
      path: "/tasks",
      postEvents: [{ name: "axtask-open-new-task", delayMs: 50 }],
    });
  });
});

describe("KBD.findTasks / Alt+F", () => {
  it("matchAltNavigationHotkey opens /tasks with axtask-focus-task-search", () => {
    expect(matchAltNavigationHotkey(key({ key: "f", altKey: true }))).toEqual({
      kind: "navigate",
      path: "/tasks",
      postEvents: [{ name: "axtask-focus-task-search", delayMs: 100 }],
    });
  });
});

describe("KBD.calendar / Alt+C", () => {
  it("matchAltNavigationHotkey navigates to /calendar", () => {
    expect(matchAltNavigationHotkey(key({ key: "c", altKey: true }))).toEqual({
      kind: "navigate",
      path: "/calendar",
    });
  });

  it("matchHotkeyFromKeyboardEvent returns navigate for Alt+C", () => {
    expect(
      matchHotkeyFromKeyboardEvent(key({ key: "c", altKey: true }), ctx(false, false)),
    ).toEqual({ kind: "navigate", path: "/calendar" });
  });

  it("plain C does not trigger calendar navigation", () => {
    expect(matchAltNavigationHotkey(key({ key: "c" }))).toBeNull();
  });
});

describe("KBD.globalSearch / Ctrl|Cmd+F", () => {
  it("matchGlobalSearchChord matches Ctrl+F", () => {
    expect(matchGlobalSearchChord(key({ key: "f", ctrlKey: true }))).toEqual({
      kind: "openGlobalSearch",
    });
  });

  it("matchGlobalSearchChord matches Cmd+F (mac)", () => {
    expect(matchGlobalSearchChord(key({ key: "f", metaKey: true }))).toEqual({
      kind: "openGlobalSearch",
    });
  });

  it("Ctrl+Shift+F does NOT match (browser find-in-files passes through)", () => {
    expect(matchGlobalSearchChord(key({ key: "f", ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it("Alt+F does NOT match global search (kept for task-search focus)", () => {
    expect(matchGlobalSearchChord(key({ key: "f", altKey: true }))).toBeNull();
  });

  it("plain F does not match", () => {
    expect(matchGlobalSearchChord(key({ key: "f" }))).toBeNull();
  });

  it("matchHotkeyFromKeyboardEvent routes Ctrl+F to openGlobalSearch", () => {
    expect(
      matchHotkeyFromKeyboardEvent(key({ key: "f", ctrlKey: true }), ctx(false, false)),
    ).toEqual({ kind: "openGlobalSearch" });
  });

  it("matchHotkeyFromKeyboardEvent routes Cmd+F to openGlobalSearch", () => {
    expect(
      matchHotkeyFromKeyboardEvent(key({ key: "f", metaKey: true }), ctx(false, false)),
    ).toEqual({ kind: "openGlobalSearch" });
  });

  it("matchHotkeyFromKeyboardEvent keeps Alt+F as task-search focus (global search does not hijack)", () => {
    const m = matchHotkeyFromKeyboardEvent(key({ key: "f", altKey: true }), ctx(false, false));
    expect(m).toEqual({
      kind: "navigate",
      path: "/tasks",
      postEvents: [{ name: "axtask-focus-task-search", delayMs: 100 }],
    });
  });
});

describe("KBD.hotkeyHelp / Ctrl+Shift+/", () => {
  it("matchToggleHotkeyHelpChord toggles hotkey help", () => {
    expect(matchToggleHotkeyHelpChord(key({ key: "?", code: "Slash", ctrlKey: true, shiftKey: true }))).toEqual({
      kind: "toggleHotkeyHelp",
    });
  });

  it("works with metaKey (Mac)", () => {
    expect(matchToggleHotkeyHelpChord(key({ key: "?", code: "Slash", metaKey: true, shiftKey: true }))).toEqual({
      kind: "toggleHotkeyHelp",
    });
  });
});

describe("KBD.tutorialToggle / Ctrl+Shift+Y", () => {
  it("matchToggleTutorialChord toggles tutorial", () => {
    expect(matchToggleTutorialChord(key({ key: "y", ctrlKey: true, shiftKey: true }))).toEqual({
      kind: "toggleTutorial",
    });
  });
});

describe("KBD.sidebar (physical Ctrl+Shift+Backslash)", () => {
  it("matchSidebarChord toggles sidebar — code is Backslash (see KBD.sidebar)", () => {
    expect(matchSidebarChord(key({ key: "\\", code: "Backslash", ctrlKey: true, shiftKey: true }))).toEqual({
      kind: "toggleSidebar",
    });
  });
});

describe("KBD.voice / Ctrl+M", () => {
  it("matchVoiceMicChord toggles voice listening", () => {
    expect(matchVoiceMicChord(key({ key: "m", ctrlKey: true }))).toEqual({
      kind: "voiceToggleListening",
    });
  });
});

describe("KBD.loginHelp / Ctrl+Shift+H", () => {
  it("matchLoginHelpChord toggles login help overlay", () => {
    expect(matchLoginHelpChord(key({ key: "h", ctrlKey: true, shiftKey: true }))).toEqual({
      kind: "toggleLoginHelp",
    });
  });
});

describe("KBD.submitTask / Enter+modifier (task form)", () => {
  it("matchTaskFormSubmitHotkey is true for Ctrl+Enter", () => {
    expect(matchTaskFormSubmitHotkey(key({ key: "Enter", ctrlKey: true }))).toBe(true);
  });

  it("matchTaskFormSubmitHotkey is true for Alt+Enter", () => {
    expect(matchTaskFormSubmitHotkey(key({ key: "Enter", altKey: true }))).toBe(true);
  });

  it("matchTaskFormSubmitHotkey is false for plain Enter", () => {
    expect(matchTaskFormSubmitHotkey(key({ key: "Enter" }))).toBe(false);
  });
});

describe("Escape: voice bar, hotkey help, mobile nav", () => {
  it("closes voice bar first when open", () => {
    expect(matchEscapeHotkey(key({ key: "Escape" }), ctx(false, true))).toEqual({ kind: "voiceCloseBar" });
    expect(matchHotkeyFromKeyboardEvent(key({ key: "Escape" }), ctx(false, true))).toEqual({ kind: "voiceCloseBar" });
  });

  it("closes hotkey help when open and voice bar closed", () => {
    expect(matchEscapeHotkey(key({ key: "Escape" }), ctx(true, false))).toEqual({ kind: "closeHotkeyHelp" });
  });

  it("dispatches mobile nav when nothing to close", () => {
    expect(matchEscapeHotkey(key({ key: "Escape" }), ctx(false, false))).toEqual({ kind: "closeMobileNav" });
  });

  it("ignores repeat Escape", () => {
    expect(matchEscapeHotkey(key({ key: "Escape", repeat: true }), ctx(false, false))).toBeNull();
  });
});
