import { describe, expect, it } from "vitest";
import { getNotificationDispatchProfile, shouldDispatchByIntensity } from "./notification-intensity";

describe("notification-intensity", () => {
  it("maps slider value to expected dispatch profile bands", () => {
    expect(getNotificationDispatchProfile(0)).toMatchObject({ band: "off", maxPerDay: 0, cadenceMinutes: null });
    expect(getNotificationDispatchProfile(20)).toMatchObject({ band: "low", maxPerDay: 3, cadenceMinutes: 360 });
    expect(getNotificationDispatchProfile(50)).toMatchObject({ band: "balanced", maxPerDay: 8, cadenceMinutes: 120 });
    expect(getNotificationDispatchProfile(95)).toMatchObject({ band: "frequent", maxPerDay: 24, cadenceMinutes: 30 });
  });

  it("gates dispatch using last sent timestamp", () => {
    const now = new Date("2026-04-03T12:00:00.000Z");
    const recentlySent = new Date("2026-04-03T11:50:00.000Z");
    const oldEnough = new Date("2026-04-03T08:00:00.000Z");

    expect(shouldDispatchByIntensity({ intensity: 0, now, lastSentAt: oldEnough })).toBe(false);
    expect(shouldDispatchByIntensity({ intensity: 100, now, lastSentAt: recentlySent })).toBe(false);
    expect(shouldDispatchByIntensity({ intensity: 60, now, lastSentAt: oldEnough })).toBe(true);
    expect(shouldDispatchByIntensity({ intensity: 60, now, lastSentAt: undefined })).toBe(true);
  });
});
