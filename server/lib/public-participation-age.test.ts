// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ageCompletedYearsUtc,
  assertEligibleForPublicParticipation,
  PublicParticipationAgeError,
} from "./public-participation-age";

describe("public-participation-age", () => {
  it("computes completed age in UTC", () => {
    expect(ageCompletedYearsUtc("2010-04-20", new Date(Date.UTC(2026, 3, 21)))).toBe(16);
    expect(ageCompletedYearsUtc("2010-04-21", new Date(Date.UTC(2026, 3, 21)))).toBe(16);
    expect(ageCompletedYearsUtc("2010-04-22", new Date(Date.UTC(2026, 3, 21)))).toBe(15);
    expect(ageCompletedYearsUtc("2013-04-21", new Date(Date.UTC(2026, 3, 21)))).toBe(13);
    expect(ageCompletedYearsUtc("2013-04-22", new Date(Date.UTC(2026, 3, 21)))).toBe(12);
  });

  it("rejects invalid calendar dates", () => {
    expect(ageCompletedYearsUtc("2013-02-29", new Date(Date.UTC(2026, 3, 21)))).toBeNull();
    expect(ageCompletedYearsUtc("not-a-date", new Date(Date.UTC(2026, 3, 21)))).toBeNull();
  });

  it("throws birth_date_required when missing", () => {
    expect(() => assertEligibleForPublicParticipation(null)).toThrow(PublicParticipationAgeError);
    expect(() => assertEligibleForPublicParticipation("")).toThrow(PublicParticipationAgeError);
    try {
      assertEligibleForPublicParticipation(null);
    } catch (e) {
      expect(e).toBeInstanceOf(PublicParticipationAgeError);
      expect((e as PublicParticipationAgeError).code).toBe("birth_date_required");
    }
  });

  it("throws under_age below 13 by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T12:00:00.000Z"));
    expect(() => assertEligibleForPublicParticipation("2014-04-22")).toThrow(PublicParticipationAgeError);
    try {
      assertEligibleForPublicParticipation("2014-04-22");
    } catch (e) {
      expect((e as PublicParticipationAgeError).code).toBe("under_age");
    }
    vi.useRealTimers();
  });

  it("allows exactly 13 on birthday (fixed UTC now)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T12:00:00.000Z"));
    expect(() => assertEligibleForPublicParticipation("2013-04-21")).not.toThrow();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
