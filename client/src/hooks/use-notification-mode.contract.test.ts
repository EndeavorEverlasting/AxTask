// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..", "..");

describe("notification mode guard wiring", () => {
  it("gracefully enables notification mode without push key", () => {
    const src = fs.readFileSync(
      path.join(root, "client", "src", "hooks", "use-notification-mode.tsx"),
      "utf8",
    );
    expect(src).toContain("Push key missing");
    expect(src).toContain("return false");
    expect(src).toContain("Notification mode is enabled. Push delivery is unavailable");
    expect(src).toContain("dispatchProfile");
    expect(src).toContain("deliveryChannel");
  });

  it("exposes public push config endpoint for runtime key resolution", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/notifications/push-public-config"');
  });
});

