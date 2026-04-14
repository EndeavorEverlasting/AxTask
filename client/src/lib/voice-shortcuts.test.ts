import { describe, expect, it } from "vitest";
import {
  matchVoiceShortcut,
  stripWakeWord,
  hasWakeWord,
  VOICE_SHORTCUT_HINTS,
} from "./voice-shortcuts";

describe("voice-shortcuts", () => {
  // ── Wake word stripping ──

  it("strips 'Hey AxTask' prefix", () => {
    expect(stripWakeWord("Hey AxTask go home")).toBe("go home");
    expect(stripWakeWord("hey axtask, find tasks")).toBe("find tasks");
  });

  it("strips 'OK AxTask' prefix", () => {
    expect(stripWakeWord("OK AxTask new task")).toBe("new task");
    expect(stripWakeWord("Okay AxTask add a task")).toBe("add a task");
  });

  it("returns original text when no wake word", () => {
    expect(stripWakeWord("add a task")).toBe("add a task");
    expect(stripWakeWord("go to dashboard")).toBe("go to dashboard");
  });

  it("hasWakeWord detects wake word presence", () => {
    expect(hasWakeWord("Hey AxTask")).toBe(true);
    expect(hasWakeWord("hey axtask find")).toBe(true);
    expect(hasWakeWord("OK AxTask")).toBe(true);
    expect(hasWakeWord("find tasks")).toBe(false);
    expect(hasWakeWord("")).toBe(false);
  });

  // ── Dashboard shortcut matching ──

  it("matches 'dashboard' phrases → dashboard", () => {
    const phrases = [
      "dashboard",
      "go to dashboard",
      "open dashboard",
      "show me the dashboard",
      "all tasks",
      "show all tasks",
      "show me my tasks",
      "go home",
      "take me home",
      "home",
      "show everything",
      "show me everything",
    ];
    for (const p of phrases) {
      expect(matchVoiceShortcut(p)).toBe("dashboard");
    }
  });

  it("matches dashboard with wake word prefix", () => {
    expect(matchVoiceShortcut("Hey AxTask go to dashboard")).toBe("dashboard");
    expect(matchVoiceShortcut("OK AxTask show all tasks")).toBe("dashboard");
  });

  // ── Find tasks shortcut matching ──

  it("matches 'find tasks' phrases → find_tasks", () => {
    const phrases = [
      "find tasks",
      "find a task",
      "search tasks",
      "search for a task",
      "search",
      "find something",
      "look for a task",
      "look up something",
    ];
    for (const p of phrases) {
      expect(matchVoiceShortcut(p)).toBe("find_tasks");
    }
  });

  it("matches find with wake word prefix", () => {
    expect(matchVoiceShortcut("Hey AxTask find a task")).toBe("find_tasks");
  });

  // ── New task shortcut matching ──

  it("matches 'new task' phrases → new_task", () => {
    const phrases = [
      "add a task",
      "new task",
      "create a task",
      "create a new task",
      "make a task",
      "add a new task",
      "add a new item",
    ];
    for (const p of phrases) {
      expect(matchVoiceShortcut(p)).toBe("new_task");
    }
  });

  it("matches new task with wake word prefix", () => {
    expect(matchVoiceShortcut("Hey AxTask add a task")).toBe("new_task");
    expect(matchVoiceShortcut("Okay AxTask new task")).toBe("new_task");
  });

  // ── Non-matching ──

  it("returns null for unrecognized phrases", () => {
    expect(matchVoiceShortcut("")).toBeNull();
    expect(matchVoiceShortcut("what is the weather")).toBeNull();
    expect(matchVoiceShortcut("hello world")).toBeNull();
  });

  // ── Hint chips constant ──

  it("VOICE_SHORTCUT_HINTS has entries for all three actions", () => {
    const actions = VOICE_SHORTCUT_HINTS.map((h) => h.action);
    expect(actions).toContain("dashboard");
    expect(actions).toContain("find_tasks");
    expect(actions).toContain("new_task");
  });

  it("each hint has a label and at least one example", () => {
    for (const hint of VOICE_SHORTCUT_HINTS) {
      expect(hint.label.length).toBeGreaterThan(0);
      expect(hint.examples.length).toBeGreaterThan(0);
    }
  });
});

