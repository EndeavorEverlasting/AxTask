import { describe, expect, it } from "vitest";
import { createPushSubscriptionSchema, updateNotificationPreferenceSchema } from "./schema";

describe("notification schemas", () => {
  it("accepts valid preference updates and rejects out-of-range intensity", () => {
    const parsed = updateNotificationPreferenceSchema.parse({ enabled: true, intensity: 72 });
    expect(parsed.enabled).toBe(true);
    expect(parsed.intensity).toBe(72);

    expect(() => updateNotificationPreferenceSchema.parse({ intensity: 101 })).toThrow();
    expect(() => updateNotificationPreferenceSchema.parse({ intensity: -1 })).toThrow();
  });

  it("accepts immersiveSoundsEnabled", () => {
    const parsed = updateNotificationPreferenceSchema.parse({ immersiveSoundsEnabled: true });
    expect(parsed.immersiveSoundsEnabled).toBe(true);
  });

  it("accepts valid push subscriptions and requires keys", () => {
    const payload = createPushSubscriptionSchema.parse({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
      expirationTime: null,
      keys: { p256dh: "abc123", auth: "def456" },
    });
    expect(payload.endpoint).toContain("https://");

    expect(() => createPushSubscriptionSchema.parse({
      endpoint: "https://example.com/push",
      keys: { p256dh: "", auth: "token" },
    })).toThrow();
  });
});
