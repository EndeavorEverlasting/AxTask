// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addCalendarDaysIso, getWesternEasterSundayIsoDate } from "./lib/western-easter";

describe("western-easter", () => {
  it("matches known Western Easter Sunday dates", () => {
    expect(getWesternEasterSundayIsoDate(2025)).toBe("2025-04-20");
    expect(getWesternEasterSundayIsoDate(2026)).toBe("2026-04-05");
    expect(getWesternEasterSundayIsoDate(2027)).toBe("2027-03-28");
  });

  it("addCalendarDaysIso steps across month boundaries", () => {
    expect(addCalendarDaysIso("2026-04-05", 1)).toBe("2026-04-06");
    expect(addCalendarDaysIso("2026-04-30", 1)).toBe("2026-05-01");
  });
});
