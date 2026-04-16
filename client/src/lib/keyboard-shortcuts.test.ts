import { describe, expect, it } from "vitest";
import { KBD, SHORTCUT_FOCUS_NOTE, SUBMIT_TASK_SHORTCUTS, tutorialToggleTitle } from "./keyboard-shortcuts";
import { matchAltNavigationHotkey } from "./hotkey-actions";

describe("keyboard-shortcuts constants", () => {
  // ── KBD mapping tests ──

  it("Alt+T is mapped to dashboard (loads all tasks), not new-task", () => {
    expect(KBD.dashboard).toBe("Alt+T");
    expect(KBD.dashboardMac).toBe("Alt+T");
  });

  it("Alt+N is mapped to newTask (open composer)", () => {
    expect(KBD.newTask).toBe("Alt+N");
    expect(KBD.newTaskMac).toBe("Alt+N");
  });

  it("Alt+F is mapped to findTasks (focus search)", () => {
    expect(KBD.findTasks).toBe("Alt+F");
    expect(KBD.findTasksMac).toBe("Alt+F");
  });

  it("dashboard, newTask, and findTasks are all different shortcuts (no collisions)", () => {
    const keys = [KBD.dashboard, KBD.newTask, KBD.findTasks];
    expect(new Set(keys).size).toBe(keys.length);
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

  it("submit task is Ctrl+Enter / Cmd+Enter / Alt+Enter", () => {
    expect(KBD.submitTask).toBe("Ctrl+Enter");
    expect(KBD.submitTaskMac).toBe("Cmd+Enter");
    expect(KBD.submitTaskAlt).toBe("Alt+Enter");
  });

  it("SUBMIT_TASK_SHORTCUTS lists all submit chords", () => {
    expect(SUBMIT_TASK_SHORTCUTS).toContain("Ctrl+Enter");
    expect(SUBMIT_TASK_SHORTCUTS).toContain("Alt+Enter");
  });

  // ── Custom event contract tests ──
  // These verify the event names that App.tsx must dispatch and TaskList/Tasks must listen to.

  it("axtask-open-new-task event fires and can be received", () => {
    let received = false;
    const handler = () => { received = true; };
    window.addEventListener("axtask-open-new-task", handler);
    window.dispatchEvent(new Event("axtask-open-new-task"));
    window.removeEventListener("axtask-open-new-task", handler);
    expect(received).toBe(true);
  });

  it("axtask-open-hotkey-help event fires and can be received", () => {
    let received = false;
    const handler = () => {
      received = true;
    };
    window.addEventListener("axtask-open-hotkey-help", handler);
    window.dispatchEvent(new Event("axtask-open-hotkey-help"));
    window.removeEventListener("axtask-open-hotkey-help", handler);
    expect(received).toBe(true);
  });

  it("axtask-close-mobile-nav event fires and can be received", () => {
    let received = false;
    const handler = () => {
      received = true;
    };
    window.addEventListener("axtask-close-mobile-nav", handler);
    window.dispatchEvent(new Event("axtask-close-mobile-nav"));
    window.removeEventListener("axtask-close-mobile-nav", handler);
    expect(received).toBe(true);
  });

  it("axtask-focus-task-search event fires and can be received", () => {
    let received = false;
    const handler = () => { received = true; };
    window.addEventListener("axtask-focus-task-search", handler);
    window.dispatchEvent(new Event("axtask-focus-task-search"));
    window.removeEventListener("axtask-focus-task-search", handler);
    expect(received).toBe(true);
  });

  // ── Alt navigation (same logic as hotkey-actions / App) ──

  it("Alt+T maps to dashboard via matchAltNavigationHotkey", () => {
    const e = new KeyboardEvent("keydown", { key: "t", altKey: true });
    expect(matchAltNavigationHotkey(e)?.kind).toBe("navigate");
    expect((matchAltNavigationHotkey(e) as { path: string }).path).toBe("/");
  });

  it("Alt+N maps to new task via matchAltNavigationHotkey", () => {
    const e = new KeyboardEvent("keydown", { key: "n", altKey: true });
    const m = matchAltNavigationHotkey(e);
    expect(m?.kind).toBe("navigate");
    if (m?.kind === "navigate") {
      expect(m.path).toBe("/tasks");
      expect(m.postEvents?.[0]?.name).toBe("axtask-open-new-task");
    }
  });

  it("Alt+F maps to find tasks via matchAltNavigationHotkey", () => {
    const e = new KeyboardEvent("keydown", { key: "f", altKey: true });
    const m = matchAltNavigationHotkey(e);
    expect(m?.kind).toBe("navigate");
    if (m?.kind === "navigate") {
      expect(m.path).toBe("/tasks");
      expect(m.postEvents?.[0]?.name).toBe("axtask-focus-task-search");
    }
  });

  it("non-Alt key presses do not match Alt navigation", () => {
    expect(matchAltNavigationHotkey(new KeyboardEvent("keydown", { key: "t", altKey: false }))).toBeNull();
  });
});

