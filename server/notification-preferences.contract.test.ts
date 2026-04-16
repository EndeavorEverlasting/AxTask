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
});

