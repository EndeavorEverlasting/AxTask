// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..", "..");
const clientSrcDir = path.join(root, "client", "src");

function walkClientSrc(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkClientSrc(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec|contract\.test|contract)\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

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

  it("no client source anywhere ships the pre-refactor 'Push key missing' toast copy", () => {
    const offenders: string[] = [];
    for (const file of walkClientSrc(clientSrcDir)) {
      const contents = fs.readFileSync(file, "utf8");
      if (contents.includes("Push key missing")) {
        offenders.push(path.relative(root, file));
      }
    }
    expect(
      offenders,
      "The string 'Push key missing' must not appear in any client source. Use the graceful toast copy from use-notification-mode.tsx. See docs/NOTIFICATIONS_AND_PUSH.md.",
    ).toEqual([]);
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

