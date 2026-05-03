// @vitest-environment node
/**
 * Guards the service worker shipped to users so previously installed clients
 * rotate to the latest build (prevents stale "Push key missing" toasts from
 * pre-refactor bundles). See docs/NOTIFICATIONS_AND_PUSH.md.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..");
const swPath = path.join(root, "client", "public", "service-worker.js");
const swSrc = fs.readFileSync(swPath, "utf8");

describe("service-worker rotation contract", () => {
  it("declares a versioned CACHE_VERSION constant", () => {
    const match = swSrc.match(/const\s+CACHE_VERSION\s*=\s*"([^"]+)"/);
    expect(match, "CACHE_VERSION constant must be present and string-literal so contributors bump it.").toBeTruthy();
    const version = match![1];
    expect(version, "CACHE_VERSION should look versioned (e.g. v2026-04-18-push)").toMatch(/^v\d{4}/);
  });

  it("derives CACHE_NAME from CACHE_VERSION so a bump invalidates previous caches", () => {
    expect(swSrc).toMatch(/const\s+CACHE_NAME\s*=\s*`axtask-offline-\$\{CACHE_VERSION\}`/);
  });

  it("calls self.skipWaiting() during install so new versions activate on first navigation", () => {
    expect(swSrc).toMatch(/self\.skipWaiting\s*\(\s*\)/);
    const installStart = swSrc.indexOf('addEventListener("install"');
    const nextListener = swSrc.indexOf("addEventListener(", installStart + 1);
    const installBlock = swSrc.slice(installStart, nextListener === -1 ? undefined : nextListener);
    expect(installBlock).toMatch(/self\.skipWaiting\s*\(\s*\)/);
  });

  it("calls self.clients.claim() during activate so existing pages adopt the new worker without reload", () => {
    const activateStart = swSrc.indexOf('addEventListener("activate"');
    const nextListener = swSrc.indexOf("addEventListener(", activateStart + 1);
    const activateBlock = swSrc.slice(activateStart, nextListener === -1 ? undefined : nextListener);
    expect(activateBlock).toMatch(/self\.clients\.claim\s*\(\s*\)/);
  });

  it("does not embed the pre-refactor 'Push key missing' toast copy", () => {
    expect(swSrc).not.toContain("Push key missing");
  });
});
