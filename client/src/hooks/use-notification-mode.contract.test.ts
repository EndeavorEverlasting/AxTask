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
    expect(src).not.toContain("Push key missing");
    expect(src).toContain("return false");
    expect(src).toContain("Notification mode is enabled. Push delivery is unavailable");
    expect(src).toContain("dispatchProfile");
    expect(src).toContain("deliveryChannel");
  });

  it("resolves VAPID before requesting browser notification permission when enabling", () => {
    const src = fs.readFileSync(
      path.join(root, "client", "src", "hooks", "use-notification-mode.tsx"),
      "utf8",
    );
    const toggleStart = src.indexOf("const toggleNotificationMode = useCallback");
    expect(toggleStart).toBeGreaterThan(-1);
    const toggleBlock = src.slice(toggleStart, toggleStart + 4000);
    const resolveIdx = toggleBlock.indexOf("await resolveVapidPublicKey()");
    const permIdx = toggleBlock.indexOf("Notification.requestPermission()");
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(permIdx).toBeGreaterThan(-1);
    expect(resolveIdx).toBeLessThan(permIdx);
  });

  it("exposes public push config endpoint for runtime key resolution", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/notifications/push-public-config"');
  });
});

