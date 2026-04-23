import { describe, expect, it } from "vitest";
import {
  matchVoiceShortcut,
  matchTaskFormVoiceSubmit,
  stripWakeWord,
  hasWakeWord,
  shouldProcessWakeListenerTranscript,
  normalizeVoiceShortcutPhrase,
  VOICE_SHORTCUT_HINTS,
} from "./voice-shortcuts";

describe("Voice: dashboard (Alt+T)", () => {
  it("matches dashboard phrases", () => {
    expect(matchVoiceShortcut("go to dashboard")).toBe("dashboard");
    expect(matchVoiceShortcut("show all tasks")).toBe("dashboard");
  });
});

describe("Voice: shopping_list", () => {
  it("matches shopping list phrases", () => {
    expect(matchVoiceShortcut("shopping list")).toBe("shopping_list");
    expect(matchVoiceShortcut("open my shopping list")).toBe("shopping_list");
  });
});

describe("Voice: calendar (Alt+C)", () => {
  it("matches calendar phrases", () => {
    expect(matchVoiceShortcut("open calendar")).toBe("calendar");
    expect(matchVoiceShortcut("my calendar")).toBe("calendar");
  });
});

describe("Voice: find_tasks (Alt+F)", () => {
  it("matches find/search phrases", () => {
    expect(matchVoiceShortcut("find tasks")).toBe("find_tasks");
    expect(matchVoiceShortcut("search")).toBe("find_tasks");
  });
});

describe("Voice: new_task (Alt+N)", () => {
  it("matches new task phrases", () => {
    expect(matchVoiceShortcut("add a task")).toBe("new_task");
    expect(matchVoiceShortcut("new task")).toBe("new_task");
  });

  it("maps AxTask add attention → new_task (ASR normalization)", () => {
    expect(matchVoiceShortcut("AxTask add attention")).toBe("new_task");
    expect(matchVoiceShortcut("hey AxTask add attention")).toBe("new_task");
  });
});

describe("Voice: global search (Ctrl+F)", () => {
  it("matches global search phrases", () => {
    expect(matchVoiceShortcut("global search")).toBe("open_global_search");
    expect(matchVoiceShortcut("open global search")).toBe("open_global_search");
    expect(matchVoiceShortcut("search everything")).toBe("open_global_search");
  });

  it("does not hijack plain task-list search intent", () => {
    expect(matchVoiceShortcut("find tasks")).toBe("find_tasks");
    expect(matchVoiceShortcut("search")).toBe("find_tasks");
  });
});

describe("Voice: tutorial (Ctrl+Shift+Y)", () => {
  it("matches tutorial phrases", () => {
    expect(matchVoiceShortcut("toggle tutorial")).toBe("toggle_tutorial");
    expect(matchVoiceShortcut("tutorial")).toBe("toggle_tutorial");
  });
});

describe("Voice: hotkey help (Ctrl+Shift+/)", () => {
  it("matches shortcuts help phrases", () => {
    expect(matchVoiceShortcut("keyboard shortcuts")).toBe("toggle_hotkey_help");
    expect(matchVoiceShortcut("hotkeys")).toBe("toggle_hotkey_help");
  });
});

describe("Voice: sidebar (Ctrl+Shift+\\)", () => {
  it("matches sidebar phrases", () => {
    expect(matchVoiceShortcut("toggle sidebar")).toBe("toggle_sidebar");
    expect(matchVoiceShortcut("sidebar")).toBe("toggle_sidebar");
  });
});

describe("Voice: wake / open voice (Ctrl+M)", () => {
  it("matches bare AxTask and wake-only phrases", () => {
    expect(matchVoiceShortcut("AxTask")).toBe("wake_open_voice");
    expect(matchVoiceShortcut("hey AxTask")).toBe("wake_open_voice");
    expect(matchVoiceShortcut("high AxTask")).toBe("wake_open_voice");
  });

  it("matches explicit voice/mic phrases", () => {
    expect(matchVoiceShortcut("start voice")).toBe("wake_open_voice");
    expect(matchVoiceShortcut("voice")).toBe("wake_open_voice");
  });
});

describe("Voice: login help (Ctrl+Shift+H)", () => {
  it("matches login help phrases", () => {
    expect(matchVoiceShortcut("login help")).toBe("toggle_login_help");
  });
});

describe("Voice: submit task (form)", () => {
  it("matchTaskFormVoiceSubmit detects submit/save", () => {
    expect(matchTaskFormVoiceSubmit("submit")).toBe(true);
    expect(matchTaskFormVoiceSubmit("save task")).toBe(true);
    expect(matchTaskFormVoiceSubmit("hey AxTask send")).toBe(true);
  });
});

describe("stripWakeWord / hasWakeWord / wake listener gate", () => {
  it("strips hey, high, and OK AxTask", () => {
    expect(stripWakeWord("Hey AxTask go home")).toBe("go home");
    expect(stripWakeWord("high AxTask find tasks")).toBe("find tasks");
    expect(stripWakeWord("OK AxTask new task")).toBe("new task");
  });

  it("strips leading AxTask before command", () => {
    expect(stripWakeWord("AxTask add a task")).toBe("add a task");
  });

  it("hasWakeWord detects variants", () => {
    expect(hasWakeWord("Hey AxTask")).toBe(true);
    expect(hasWakeWord("high AxTask")).toBe(true);
    expect(hasWakeWord("find tasks")).toBe(false);
  });

  it("shouldProcessWakeListenerTranscript gates background listener", () => {
    expect(shouldProcessWakeListenerTranscript("hey AxTask test")).toBe(true);
    expect(shouldProcessWakeListenerTranscript("AxTask go")).toBe(true);
    expect(shouldProcessWakeListenerTranscript("go home")).toBe(false);
  });

  it("normalizeVoiceShortcutPhrase maps add attention → add a task", () => {
    expect(normalizeVoiceShortcutPhrase("add attention")).toBe("add a task");
  });
});

describe("VOICE_SHORTCUT_HINTS", () => {
  it("covers all non-null shortcut actions", () => {
    const labels = VOICE_SHORTCUT_HINTS.map((h) => h.label);
    expect(labels.length).toBeGreaterThanOrEqual(10);
    for (const hint of VOICE_SHORTCUT_HINTS) {
      expect(hint.examples.length).toBeGreaterThan(0);
    }
  });
});

describe("Voice: alarms", () => {
  it("matches open alarm panel phrases", () => {
    expect(matchVoiceShortcut("open alarms")).toBe("open_alarm_panel");
    expect(matchVoiceShortcut("alarm panel")).toBe("open_alarm_panel");
  });

  it("matches list alarms phrases", () => {
    expect(matchVoiceShortcut("list alarms")).toBe("list_alarms");
    expect(matchVoiceShortcut("what alarms")).toBe("list_alarms");
  });
});

describe("Non-matching", () => {
  it("returns null for unrelated speech", () => {
    expect(matchVoiceShortcut("what is the weather")).toBeNull();
    expect(matchVoiceShortcut("")).toBeNull();
  });
});
