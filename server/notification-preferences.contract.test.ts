// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("notification preferences route contracts", () => {
  it("exposes dispatch telemetry for slider policy and delivery channel", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('"/api/notifications/preferences"');
    expect(routes).toContain("dispatchProfile");
    expect(routes).toContain("pushConfigured");
    expect(routes).toContain("hasSubscription");
    expect(routes).toContain("deliveryChannel");
  });

  it("exposes authenticated push public config for client-side subscription", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/notifications/push-public-config"');
    expect(routes).toContain("configured:");
    expect(routes).toContain("publicKey:");
  });

  it("computes deliveryChannel as 'push' only when enabled, pushConfigured, AND hasSubscription are all true", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    // Both the GET and PATCH handlers must share the same gating shape.
    const matches = routes.match(
      /preference\.enabled\s*&&\s*pushConfigured\s*&&\s*hasSubscription\s*\?\s*"push"\s*:\s*"in_app"/g,
    );
    expect(matches, "deliveryChannel must require enabled && pushConfigured && hasSubscription").toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("validates POST /api/notifications/subscriptions body via createPushSubscriptionSchema", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.post("/api/notifications/subscriptions"');
    expect(routes).toContain("createPushSubscriptionSchema.parse(req.body");
    expect(routes).toContain("upsertUserPushSubscription");
  });

  it("exposes DELETE /api/notifications/subscriptions for unsubscribe flow", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.delete("/api/notifications/subscriptions"');
    expect(routes).toContain("deleteUserPushSubscription");
  });

  it("accepts and round-trips feedbackNudgePrefs on notification preferences", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    // Phase F-1: concatenate every per-domain schema file so the static match
    // still finds declarations that moved out of the monolith barrel.
    const schema = [
      "shared/schema.ts",
      "shared/schema/core.ts",
      "shared/schema/tasks.ts",
      "shared/schema/gamification.ts",
      "shared/schema/ops.ts",
    ]
      .map((rel) => fs.readFileSync(path.join(root, rel), "utf8"))
      .join("\n\n");
    const storage = fs.readFileSync(path.join(root, "server", "storage.ts"), "utf8");

    /* Schema has the new jsonb column and Zod validator. */
    expect(schema).toContain('feedbackNudgePrefs: jsonb("feedback_nudge_prefs")');
    expect(schema).toContain("feedbackNudgePrefsSchema");
    expect(schema).toContain("feedbackAvatarKeySchema");

    /* PATCH handler threads the new field through to storage. */
    expect(routes).toContain("feedbackNudgePrefs: payload.feedbackNudgePrefs");

    /* Storage layer clamps + sanitizes round-tripped values. */
    expect(storage).toContain("sanitizeFeedbackNudgePrefs");
    expect(storage).toContain("mergeFeedbackNudgePrefs");
  });

  it("exposes GET /api/gamification/avatar-voices for persona openers", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('"/api/gamification/avatar-voices"');
    expect(routes).toContain("listAvatarVoiceOpeners()");
  });

  it("migration 0018 adds feedback_nudge_prefs column idempotently", () => {
    const sql = fs.readFileSync(
      path.join(root, "migrations", "0018_notification_preferences_feedback_nudge_prefs.sql"),
      "utf8",
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS feedback_nudge_prefs jsonb/i);
    expect(sql).toMatch(/NOT NULL DEFAULT/i);
  });

  it("includes grocery reminder preference fields in schema and PATCH threading", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    const schema = [
      "shared/schema.ts",
      "shared/schema/core.ts",
      "shared/schema/tasks.ts",
      "shared/schema/gamification.ts",
      "shared/schema/ops.ts",
    ]
      .map((rel) => fs.readFileSync(path.join(root, rel), "utf8"))
      .join("\n\n");

    expect(schema).toContain('groceryReminderEnabled: boolean("grocery_reminder_enabled")');
    expect(schema).toContain('groceryAutoCreateTaskEnabled: boolean("grocery_auto_create_task_enabled")');
    expect(schema).toContain('groceryAutoNotifyEnabled: boolean("grocery_auto_notify_enabled")');
    expect(routes).toContain("groceryReminderEnabled: payload.groceryReminderEnabled");
    expect(routes).toContain("groceryAutoCreateTaskEnabled: payload.groceryAutoCreateTaskEnabled");
    expect(routes).toContain("groceryAutoNotifyEnabled: payload.groceryAutoNotifyEnabled");
  });

  it("migration 0033 adds grocery reminder columns idempotently", () => {
    const sql = fs.readFileSync(
      path.join(root, "migrations", "0033_notification_preferences_grocery_reminders.sql"),
      "utf8",
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS grocery_reminder_enabled boolean NOT NULL DEFAULT true/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS grocery_auto_create_task_enabled boolean NOT NULL DEFAULT false/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS grocery_auto_notify_enabled boolean NOT NULL DEFAULT false/i);
  });
});

