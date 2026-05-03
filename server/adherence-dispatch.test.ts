// @vitest-environment node
/**
 * Guards the server-side graceful-fallback invariants for Web Push dispatch:
 * - When VAPID keys are missing, the dispatcher must return {attempted:0, sent:0}
 *   without throwing so the rest of the adherence cron tick keeps running.
 * - When adherence is disabled, the dispatcher must short-circuit before any
 *   storage imports happen.
 * See docs/NOTIFICATIONS_AND_PUSH.md.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dispatchAdherencePushNotifications } from "./services/adherence-dispatch";

const ENV_KEYS = [
  "VAPID_PUBLIC_KEY",
  "VITE_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "ADHERENCE_INTERVENTIONS_ENABLED",
] as const;

describe("dispatchAdherencePushNotifications graceful fallback", () => {
  const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns zero counts without throwing when adherence is disabled", async () => {
    process.env.ADHERENCE_INTERVENTIONS_ENABLED = "false";
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";

    const result = await dispatchAdherencePushNotifications(10);
    expect(result).toEqual({ attempted: 0, sent: 0 });
  });

  it("returns zero counts without throwing when VAPID_PUBLIC_KEY is missing", async () => {
    process.env.ADHERENCE_INTERVENTIONS_ENABLED = "true";
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VITE_VAPID_PUBLIC_KEY;
    process.env.VAPID_PRIVATE_KEY = "private";

    const result = await dispatchAdherencePushNotifications(10);
    expect(result).toEqual({ attempted: 0, sent: 0 });
  });

  it("returns zero counts without throwing when VAPID_PRIVATE_KEY is missing", async () => {
    process.env.ADHERENCE_INTERVENTIONS_ENABLED = "true";
    process.env.VAPID_PUBLIC_KEY = "public";
    delete process.env.VAPID_PRIVATE_KEY;

    const result = await dispatchAdherencePushNotifications(10);
    expect(result).toEqual({ attempted: 0, sent: 0 });
  });

  it("short-circuits before importing storage when VAPID is missing", async () => {
    process.env.ADHERENCE_INTERVENTIONS_ENABLED = "true";
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VITE_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    await expect(dispatchAdherencePushNotifications(10)).resolves.toEqual({
      attempted: 0,
      sent: 0,
    });
  });
});
