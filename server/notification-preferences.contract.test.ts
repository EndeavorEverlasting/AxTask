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
});

