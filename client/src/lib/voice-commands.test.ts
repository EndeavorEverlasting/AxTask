import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseVoiceCommands, stripCommandText, type VoiceCommand } from "./voice-commands";

const findCmd = (cmds: VoiceCommand[], type: string) => cmds.find(c => c.type === type);

const realDate = Date;
function mockToday(iso: string) {
  const fixed = new Date(iso);
  vi.useFakeTimers();
  vi.setSystemTime(fixed);
}

describe("parseVoiceCommands", () => {
  beforeEach(() => mockToday("2026-03-31T12:00:00Z"));
  afterEach(() => vi.useRealTimers());

  describe("priority / urgency commands", () => {
    it("detects 'set priority to high'", () => {
      const cmds = parseVoiceCommands("set priority to high");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(4);
    });

    it("detects 'priority critical'", () => {
      const cmds = parseVoiceCommands("priority critical");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(5);
    });

    it("detects 'make it medium'", () => {
      const cmds = parseVoiceCommands("make it medium");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(3);
    });

    it("detects 'low priority'", () => {
      const cmds = parseVoiceCommands("low priority");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(1);
    });

    it("detects 'highest priority'", () => {
      const cmds = parseVoiceCommands("highest priority");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(4);
    });

    it("detects 'critical priority'", () => {
      const cmds = parseVoiceCommands("critical priority");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(5);
    });

    it("detects 'set priority to very high'", () => {
      const cmds = parseVoiceCommands("set priority to very high");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(4);
    });

    it("is case-insensitive", () => {
      const cmds = parseVoiceCommands("SET PRIORITY TO HIGH");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(4);
    });
  });

  describe("urgency numeric commands", () => {
    it("detects 'urgency 3'", () => {
      const cmds = parseVoiceCommands("urgency 3");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(3);
    });

    it("detects 'set urgency to 5'", () => {
      const cmds = parseVoiceCommands("set urgency to 5");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(5);
    });

    it("detects 'not urgent'", () => {
      const cmds = parseVoiceCommands("not urgent");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(1);
    });

    it("detects 'very urgent'", () => {
      const cmds = parseVoiceCommands("very urgent");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(5);
    });

    it("detects 'urgent'", () => {
      const cmds = parseVoiceCommands("urgent");
      const u = findCmd(cmds, "urgency");
      expect(u).toBeDefined();
      expect(u!.value).toBe(4);
    });

    it("rejects out-of-range values (0 or 6+)", () => {
      const cmds0 = parseVoiceCommands("urgency 0");
      expect(findCmd(cmds0, "urgency")).toBeUndefined();

      const cmds9 = parseVoiceCommands("urgency 9");
      expect(findCmd(cmds9, "urgency")).toBeUndefined();
    });
  });

  describe("status commands", () => {
    it("detects 'mark as completed'", () => {
      const cmds = parseVoiceCommands("mark as completed");
      const s = findCmd(cmds, "status");
      expect(s).toBeDefined();
      expect(s!.value).toBe("completed");
    });

    it("detects 'set it complete'", () => {
      const cmds = parseVoiceCommands("set it complete");
      const s = findCmd(cmds, "status");
      expect(s).toBeDefined();
      expect(s!.value).toBe("completed");
    });

    it("detects 'mark as in progress'", () => {
      const cmds = parseVoiceCommands("mark as in progress");
      const s = findCmd(cmds, "status");
      expect(s).toBeDefined();
      expect(s!.value).toBe("in-progress");
    });

    it("detects 'set as pending'", () => {
      const cmds = parseVoiceCommands("set as pending");
      const s = findCmd(cmds, "status");
      expect(s).toBeDefined();
      expect(s!.value).toBe("pending");
    });

    it("detects 'mark as done'", () => {
      const cmds = parseVoiceCommands("mark as done");
      const s = findCmd(cmds, "status");
      expect(s).toBeDefined();
      expect(s!.value).toBe("completed");
    });

    it("detects 'in progress' without mark/set prefix", () => {
      const cmds = parseVoiceCommands("in progress");
      const s = findCmd(cmds, "status");
      expect(s).toBeDefined();
      expect(s!.value).toBe("in-progress");
    });
  });

  describe("date commands", () => {
    it("detects 'due today'", () => {
      const cmds = parseVoiceCommands("due today");
      const d = findCmd(cmds, "date");
      expect(d).toBeDefined();
      expect(d!.value).toBe("2026-03-31");
    });

    it("detects 'due tomorrow'", () => {
      const cmds = parseVoiceCommands("due tomorrow");
      const d = findCmd(cmds, "date");
      expect(d).toBeDefined();
      expect(d!.value).toBe("2026-04-01");
    });

    it("detects 'due in 3 days'", () => {
      const cmds = parseVoiceCommands("due in 3 days");
      const d = findCmd(cmds, "date");
      expect(d).toBeDefined();
      expect(d!.value).toBe("2026-04-03");
    });

    it("detects 'due 5 days'", () => {
      const cmds = parseVoiceCommands("due 5 days");
      const d = findCmd(cmds, "date");
      expect(d).toBeDefined();
      expect(d!.value).toBe("2026-04-05");
    });

    it("detects 'due next week'", () => {
      const cmds = parseVoiceCommands("due next week");
      const d = findCmd(cmds, "date");
      expect(d).toBeDefined();
      expect(d!.value).toBe("2026-04-07");
    });

    it("detects 'set date to today'", () => {
      const cmds = parseVoiceCommands("set date to today");
      const d = findCmd(cmds, "date");
      expect(d).toBeDefined();
      expect(d!.value).toBe("2026-03-31");
    });

    it("detects 'set date to tomorrow'", () => {
      const cmds = parseVoiceCommands("set date to tomorrow");
      const d = findCmd(cmds, "date");
      expect(d).toBeDefined();
      expect(d!.value).toBe("2026-04-01");
    });

    it("detects 'due 1 day' (singular)", () => {
      const cmds = parseVoiceCommands("due 1 day");
      const d = findCmd(cmds, "date");
      expect(d).toBeDefined();
      expect(d!.value).toBe("2026-04-01");
    });
  });

  describe("tag commands", () => {
    it("detects 'tag it as work'", () => {
      const cmds = parseVoiceCommands("tag it as work");
      const t = findCmd(cmds, "tag");
      expect(t).toBeDefined();
      expect(t!.value).toBe("#work");
    });

    it("detects 'tag with personal'", () => {
      const cmds = parseVoiceCommands("tag with personal");
      const t = findCmd(cmds, "tag");
      expect(t).toBeDefined();
      expect(t!.value).toBe("#personal");
    });

    it("detects 'tag as urgent fix'", () => {
      const cmds = parseVoiceCommands("tag as urgent fix");
      const t = findCmd(cmds, "tag");
      expect(t).toBeDefined();
      expect(t!.value).toBe("#urgent fix");
    });
  });

  describe("combined commands", () => {
    it("detects multiple commands in one sentence", () => {
      const cmds = parseVoiceCommands("set priority to high mark as in progress due tomorrow");
      expect(cmds.length).toBeGreaterThanOrEqual(3);
      expect(findCmd(cmds, "urgency")).toBeDefined();
      expect(findCmd(cmds, "status")).toBeDefined();
      expect(findCmd(cmds, "date")).toBeDefined();
    });

    it("detects urgency + date together", () => {
      const cmds = parseVoiceCommands("very urgent due today");
      expect(findCmd(cmds, "urgency")).toBeDefined();
      expect(findCmd(cmds, "date")).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("returns empty array for plain text with no commands", () => {
      const cmds = parseVoiceCommands("go to the grocery store and buy milk");
      expect(cmds).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      const cmds = parseVoiceCommands("");
      expect(cmds).toEqual([]);
    });

    it("returns empty array for whitespace-only string", () => {
      const cmds = parseVoiceCommands("   ");
      expect(cmds).toEqual([]);
    });

    it("handles mixed case input", () => {
      const cmds = parseVoiceCommands("DUE TOMORROW");
      const d = findCmd(cmds, "date");
      expect(d).toBeDefined();
      expect(d!.value).toBe("2026-04-01");
    });
  });
});

describe("stripCommandText", () => {
  it("strips priority commands", () => {
    expect(stripCommandText("buy groceries set priority to high")).toBe("buy groceries");
    expect(stripCommandText("high priority task for tomorrow")).toBe("task for tomorrow");
    expect(stripCommandText("make it critical send email")).toBe("send email");
  });

  it("strips urgency commands", () => {
    expect(stripCommandText("send report urgent")).toBe("send report");
    expect(stripCommandText("very urgent deploy fix")).toBe("deploy fix");
    expect(stripCommandText("not urgent clean desk")).toBe("clean desk");
    expect(stripCommandText("urgency 5 submit form")).toBe("submit form");
    expect(stripCommandText("set urgency to 3 check in")).toBe("check in");
  });

  it("strips status commands", () => {
    expect(stripCommandText("mark as completed buy milk")).toBe("buy milk");
    expect(stripCommandText("set as pending review PR")).toBe("review PR");
    expect(stripCommandText("mark as done finish report")).toBe("finish report");
    expect(stripCommandText("call client mark as in progress")).toBe("call client");
  });

  it("strips date commands", () => {
    expect(stripCommandText("call dentist due today")).toBe("call dentist");
    expect(stripCommandText("submit report due tomorrow")).toBe("submit report");
    expect(stripCommandText("plan trip due in 5 days")).toBe("plan trip");
    expect(stripCommandText("review code due next week")).toBe("review code");
    expect(stripCommandText("set date to today prepare slides")).toBe("prepare slides");
  });

  it("strips tag commands", () => {
    expect(stripCommandText("fix login bug tag as work")).toBe("fix login bug");
    expect(stripCommandText("buy flowers tag it as personal")).toBe("buy flowers");
  });

  it("strips multiple commands from one sentence", () => {
    const result = stripCommandText("buy groceries set priority to high due tomorrow mark as pending");
    expect(result).not.toContain("priority");
    expect(result).not.toContain("due tomorrow");
    expect(result).not.toContain("mark as pending");
    expect(result).toContain("buy groceries");
  });

  it("collapses extra whitespace", () => {
    const result = stripCommandText("   task   set priority to high   notes   ");
    expect(result).not.toMatch(/\s{2,}/);
  });

  it("returns empty string when entire input is a command", () => {
    expect(stripCommandText("due tomorrow")).toBe("");
  });

  it("returns original text when no commands present", () => {
    expect(stripCommandText("buy milk and eggs")).toBe("buy milk and eggs");
  });

  it("handles empty string", () => {
    expect(stripCommandText("")).toBe("");
  });
});
