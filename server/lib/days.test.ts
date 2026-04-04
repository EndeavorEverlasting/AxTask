import { describe, it, expect } from "vitest";
import { daysBetween } from "./days";

describe("daysBetween", () => {
  it("returns day distance for valid ISO dates", () => {
    expect(daysBetween("2026-01-01", "2026-01-05")).toBe(4);
  });

  it("throws on invalid date strings", () => {
    expect(() => daysBetween("not-a-date", "2026-01-01")).toThrow(/Invalid date string/);
  });
});
