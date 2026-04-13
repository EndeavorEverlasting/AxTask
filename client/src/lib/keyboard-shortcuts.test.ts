import { describe, expect, it } from "vitest";
import { KBD, SHORTCUT_FOCUS_NOTE, tutorialToggleTitle } from "./keyboard-shortcuts";

describe("keyboard-shortcuts constants", () => {
  it("Alt+T is mapped to dashboard (loads all tasks), not new-task", () => {
    expect(KBD.dashboard).toBe("Alt+T");
    expect(KBD.dashboardMac).toBe("Alt+T");
  });

  it("Alt+N is mapped to newTask (open composer)", () => {
    expect(KBD.newTask).toBe("Alt+N");
    expect(KBD.newTaskMac).toBe("Alt+N");
  });

  it("dashboard and newTask are different shortcuts (no collision)", () => {
    expect(KBD.dashboard).not.toBe(KBD.newTask);
  });

  it("does not use Ctrl+T or Cmd+T (reserved for browser tabs)", () => {
    const allValues = Object.values(KBD);
    for (const v of allValues) {
      expect(v).not.toMatch(/^Ctrl\+T$/i);
      expect(v).not.toMatch(/^Cmd\+T$/i);
    }
  });

  it("SHORTCUT_FOCUS_NOTE mentions browser tab reservation", () => {
    expect(SHORTCUT_FOCUS_NOTE).toContain("Ctrl+T");
    expect(SHORTCUT_FOCUS_NOTE).toContain("Cmd+T");
  });

  it("tutorialToggleTitle returns both platform variants", () => {
    const title = tutorialToggleTitle();
    expect(title).toContain(KBD.tutorialToggle);
    expect(title).toContain(KBD.tutorialToggleMac);
  });

  it("all KBD entries are non-empty strings", () => {
    for (const [key, value] of Object.entries(KBD)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("voice shortcut is Ctrl+M / Cmd+M", () => {
    expect(KBD.voice).toBe("Ctrl+M");
    expect(KBD.voiceMac).toBe("Cmd+M");
  });

  it("submit task is Ctrl+Enter / Cmd+Enter", () => {
    expect(KBD.submitTask).toBe("Ctrl+Enter");
    expect(KBD.submitTaskMac).toBe("Cmd+Enter");
  });
});

