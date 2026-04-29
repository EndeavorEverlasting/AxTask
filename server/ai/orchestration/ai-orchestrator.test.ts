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

  it("parses location offset reminders for home/work", async () => {
    const out = await interpretIntent("Set a reminder to check oil five minutes after I get home every day.");
    expect(out.intent.type).toBe("create_reminder");
    if (out.intent.type !== "create_reminder") return;
    expect(out.intent.payload.trigger.type).toBe("location_arrival_offset");
    if (out.intent.payload.trigger.type !== "location_arrival_offset") return;
    expect(out.intent.payload.trigger.placeSlug).toBe("home");
    expect(out.intent.payload.trigger.offsetMinutes).toBe(5);
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
      LlmProviderConfigError
    );
  });
  it("throws config error when provider is required but missing", async () => {
    await expect(interpretIntent("Please help me with my schedule soon")).rejects.toBeInstanceOf(LlmProviderConfigError);
  });
});
