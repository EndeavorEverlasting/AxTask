// @vitest-environment node
import { describe, expect, it } from "vitest";
import { interpretIntent, LlmProviderConfigError } from "./ai-orchestrator";

describe("interpretIntent", () => {
  it("returns clarification for vague recurrence phrasing", async () => {
    const out = await interpretIntent("Remind me every now and again to buy groceries");
    expect(out.intent.type).toBe("clarification");
    expect(out.intent.payload.reason.toLowerCase()).toContain("ambiguous");
    expect(out.provider).toBe("rule_parser");
  });

  it("parses location offset reminders for home/work with explicit minutes", async () => {
    const out = await interpretIntent("Set a reminder to check oil five minutes after I get home every day.");
    expect(out.intent.type).toBe("create_reminder");
    if (out.intent.type !== "create_reminder") return;
    expect(out.intent.payload.trigger.type).toBe("location_arrival_offset");
    if (out.intent.payload.trigger.type !== "location_arrival_offset") return;
    expect(out.intent.payload.trigger.placeSlug).toBe("home");
    expect(out.intent.payload.trigger.offsetMinutes).toBe(5);
    expect(out.intent.payload.trigger.recurrence?.frequency).toBe("daily");
  });

  it("uses location_arrival when user asks to be reminded when they get home (no minute offset)", async () => {
    const out = await interpretIntent("Remind me when I get home.");
    expect(out.intent.type).toBe("create_reminder");
    if (out.intent.type !== "create_reminder") return;
    expect(out.intent.payload.kind).toBe("location_event");
    expect(out.intent.payload.trigger.type).toBe("location_arrival");
    if (out.intent.payload.trigger.type !== "location_arrival") return;
    expect(out.intent.payload.trigger.placeSlug).toBe("home");
  });

  it("uses location_arrival for when I get to work", async () => {
    const out = await interpretIntent("Remind me when I get to work to call Sam");
    expect(out.intent.type).toBe("create_reminder");
    if (out.intent.type !== "create_reminder") return;
    expect(out.intent.payload.trigger.type).toBe("location_arrival");
    if (out.intent.payload.trigger.type !== "location_arrival") return;
    expect(out.intent.payload.trigger.placeSlug).toBe("work");
    expect(out.intent.payload.title.toLowerCase()).toContain("call sam");
  });

  it("does not invent offset minutes when user omits them after arrival phrase", async () => {
    const out = await interpretIntent("Set a reminder after I get home to stretch");
    expect(out.intent.type).toBe("create_reminder");
    if (out.intent.type !== "create_reminder") return;
    expect(out.intent.payload.trigger.type).toBe("location_arrival");
  });

  it("asks clarification when daily location reminder lacks explicit offset", async () => {
    const out = await interpretIntent("Remind me every day after I get home to water plants");
    expect(out.intent.type).toBe("clarification");
    if (out.intent.type !== "clarification") return;
    expect(out.intent.payload.missingFields.join(",")).toContain("offset");
  });

  it("quick-parses simple create_task phrases", async () => {
    const out = await interpretIntent("Make a task to vacuum the hallway");
    expect(out.intent.type).toBe("create_task");
    if (out.intent.type !== "create_task") return;
    expect(out.intent.payload.activity.toLowerCase()).toContain("vacuum");
  });

  it("does not quick-parse recurring schedule phrases for create_task", async () => {
    await expect(interpretIntent("Make a task to do laundry every Saturday morning")).rejects.toBeInstanceOf(
      LlmProviderConfigError,
    );
  });

  it("returns clarification when recurrence lacks explicit time", async () => {
    const outDaily = await interpretIntent("Remind me to drink water every day");
    expect(outDaily.intent.type).toBe("clarification");
    expect(outDaily.intent.payload.missingFields).toContain("time");

    const outWeekly = await interpretIntent("Remind me weekly to water plants");
    expect(outWeekly.intent.type).toBe("clarification");
    expect(outWeekly.intent.payload.missingFields).toContain("time");

    const outMonthly = await interpretIntent("Remind me to pay bills monthly");
    expect(outMonthly.intent.type).toBe("clarification");
    expect(outMonthly.intent.payload.missingFields).toContain("time");
  });

  it("throws config error when provider is missing for explicit time recurrence", async () => {
    await expect(interpretIntent("Remind me daily at 3pm to stretch")).rejects.toBeInstanceOf(
      LlmProviderConfigError,
    );
  });
  it("throws config error when provider is required but missing", async () => {
    await expect(interpretIntent("Please help me with my schedule soon")).rejects.toBeInstanceOf(
      LlmProviderConfigError,
    );
  });
});
