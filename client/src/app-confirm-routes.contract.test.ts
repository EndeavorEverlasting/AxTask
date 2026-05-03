// @vitest-environment node
/**
 * Contract test for the /mfa/confirm + /welcome-confirm routing.
 *
 * Both URLs (including every challengeId/code/purpose permutation the
 * operator asked us to smoke-test) render the same ExperienceConfirmPage
 * bridge. This test verifies App.tsx actually wires that up — a regression
 * here would re-introduce the bug where the page silently redirected bad
 * confirmation URLs into the app.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "App.tsx"), "utf8");

describe("App.tsx MFA/welcome confirmation routes", () => {
  it("imports ExperienceConfirmPage eagerly", () => {
    // The confirmation bridge is eager-imported by app-route-lazy.contract.test.ts;
    // double-check here that the import path is still correct.
    expect(SRC).toMatch(
      /import\s+ExperienceConfirmPage\s+from\s+["']@\/pages\/experience-confirm["']/,
    );
  });

  it("routes /mfa/confirm to ExperienceConfirmPage", () => {
    // The App shell short-circuits both /mfa/confirm and /welcome-confirm
    // to the ExperienceConfirmPage via a single location check.
    expect(SRC).toMatch(
      /location\s*===\s*"\/mfa\/confirm"[\s\S]*?return\s+<ExperienceConfirmPage\s*\/>/,
    );
  });

  it("routes /welcome-confirm to ExperienceConfirmPage", () => {
    expect(SRC).toMatch(
      /location\s*===\s*"\/welcome-confirm"[\s\S]*?return\s+<ExperienceConfirmPage\s*\/>/,
    );
  });

  it("uses the branded RouteFallback (not a bg-background spinner) for lazy routes", () => {
    // Regression guard: the old fallback used `bg-background` which looks
    // unbranded / half-broken during a cold start. Make sure the new
    // fallback renders the AxTask wordmark and an emerald accent.
    expect(SRC).toMatch(/function RouteFallback\(\)/);
    const fallback = SRC.match(/function RouteFallback\(\)\s*\{[\s\S]*?^}/m);
    expect(fallback, "expected a RouteFallback function block").toBeTruthy();
    const body = fallback![0];
    expect(body).toMatch(/AxTask/);
    expect(body).toMatch(/role="status"/);
    expect(body).not.toMatch(/className="[^"]*\bbg-background\b/);
  });
});

describe("/login + /mfa/confirm + /welcome-confirm smoke URLs", () => {
  // These are the URL shapes the ops checklist asks us to smoke-test.
  // We don't actually navigate to them here — we just assert that the
  // App.tsx router declares the pages that handle every one of them.
  const urls = [
    "/login",
    "/login?mode=register",
    "/login?reset_token=test",
    "/login?step=totp",
    "/mfa/confirm",
    "/mfa/confirm?challengeId=test",
    "/mfa/confirm?code=123456",
    "/mfa/confirm?purpose=account:verify_phone",
    "/mfa/confirm?challengeId=test&code=123456&purpose=account:verify_phone",
    "/welcome-confirm",
  ];

  it("each smoke URL targets a page that App.tsx knows about", () => {
    for (const url of urls) {
      const pathname = url.split("?")[0];
      if (pathname === "/login") {
        expect(SRC).toMatch(/<LoginPage\s*\/>/);
      } else if (pathname === "/mfa/confirm" || pathname === "/welcome-confirm") {
        expect(SRC).toMatch(/<ExperienceConfirmPage\s*\/>/);
      }
    }
  });
});
