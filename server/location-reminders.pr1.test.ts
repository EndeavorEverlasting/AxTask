// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  createLocationPlaceSchema,
  createLocationEventSchema,
  createReminderSchema,
  recurrenceRuleSchema,
} from "@shared/schema";
import { slugifyPlaceBase } from "./lib/place-slug";

describe("Gentle Reminder PR1 Zod (ops.ts)", () => {
  it("createLocationPlaceSchema accepts a minimal home row", () => {
    const parsed = createLocationPlaceSchema.parse({
      slug: "home",
      placeType: "home",
      label: "Home",
      radiusMeters: 200,
    });
    expect(parsed.placeType).toBe("home");
  });

  it("createLocationEventSchema accepts enter with optional occurredAt", () => {
    const parsed = createLocationEventSchema.parse({
      placeId: "550e8400-e29b-41d4-a716-446655440000",
      eventType: "enter",
    });
    expect(parsed.eventType).toBe("enter");
  });

  it("recurrenceRuleSchema supports daily frequency", () => {
    const parsed = recurrenceRuleSchema.parse({ frequency: "daily" });
    expect(parsed.frequency).toBe("daily");
  });

  it("createReminderSchema accepts location_arrival_offset trigger", () => {
    const parsed = createReminderSchema.parse({
      kind: "location_offset",
      title: "Check oil",
      trigger: {
        type: "location_arrival_offset",
        placeSlug: "home",
        offsetMinutes: 5,
        recurrence: { frequency: "daily" },
      },
    });
    expect(parsed.trigger.type).toBe("location_arrival_offset");
  });
});

describe("slugifyPlaceBase", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyPlaceBase("  My   Gym  ")).toBe("my-gym");
  });

  it("uses fallback when only punctuation", () => {
    expect(slugifyPlaceBase("???")).toBe("place");
  });
});
