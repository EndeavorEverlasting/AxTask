import { describe, expect, it } from "vitest";
import { parseNaturalCommand, commandNeedsFullReview } from "./parse-natural-command";

const now = new Date("2026-04-25T12:00:00-04:00");
const todayStr = "2026-04-25";
const ctx = { now, todayStr };

describe("parseNaturalCommand", () => {
  it("parses reminder with tomorrow 7pm", () => {
    const c = parseNaturalCommand("remind me to check oil tomorrow at 7pm", ctx);
    expect(c.kind).toBe("create_reminder");
    expect(c.activity).toContain("check oil");
    expect(c.date).toBe("2026-04-26");
    expect(c.time).toBe("19:00");
    expect(c.confidence).toBeGreaterThan(0.7);
  });

  it("parses reminder with bare hour (ambiguous time warning)", () => {
    const c = parseNaturalCommand("remind me about groceries at 9am", ctx);
    expect(c.kind).toBe("create_reminder");
    expect(c.activity).toMatch(/groceries/i);
    expect(c.time).toBe("09:00");
  });

  it("parses weekly recurrence (Saturday morning)", () => {
    const c = parseNaturalCommand("laundry every Saturday morning", ctx);
    expect(c.kind).toBe("create_recurring_task");
    expect(c.recurrence).toBe("weekly");
    expect(c.activity).toMatch(/laundry/);
  });

  it("parses do laundry every week", () => {
    const c = parseNaturalCommand("do laundry every week", ctx);
    expect(c.kind).toBe("create_recurring_task");
    expect(c.recurrence).toBe("weekly");
  });

  it("parses planning request", () => {
    const c = parseNaturalCommand("help me plan my report for Josh on April billing hours", ctx);
    expect(c.kind).toBe("planning_request");
    expect(c.planningTopic).toBeTruthy();
  });

  it("parses alarm list", () => {
    const c = parseNaturalCommand("show my alarms", ctx);
    expect(c.kind).toBe("alarm_list");
    expect(c.needsConfirmation).toBe(false);
  });

  it("parses navigation to calendar", () => {
    const c = parseNaturalCommand("open calendar", ctx);
    expect(c.kind).toBe("navigation");
    expect(c.navigationTarget).toBe("/calendar");
  });

  it("parses search", () => {
    const c = parseNaturalCommand("find billing tasks", ctx);
    expect(c.kind).toBe("search");
    expect(c.searchQuery).toMatch(/billing/i);
  });

  it("parses task review", () => {
    const c = parseNaturalCommand("mark laundry done", ctx);
    expect(c.kind).toBe("task_review");
    expect(c.activity).toMatch(/laundry/i);
  });

  it("exposes commandNeedsFullReview for low confidence", () => {
    const c = parseNaturalCommand("remind me about groceries at 9am", ctx);
    expect(commandNeedsFullReview(c) || c.warnings.length > 0).toBe(true);
  });
});
