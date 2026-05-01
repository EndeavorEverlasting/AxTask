// @vitest-environment node
/**
 * Contract tests for the /login page query-string branches and invite-code
 * input behavior. These are source-level asserts (like
 * app-route-lazy.contract.test.ts) so they are cheap to run in CI and catch
 * regressions in the URL-handoff wiring without spinning up a real DOM.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "login.tsx"), "utf8");

describe("/login query-string branches", () => {
  it("handles ?mode=register by switching to the register form", () => {
    // The register URL param triggers setMode("register") and shows the form.
    expect(SRC).toMatch(/params\.get\("mode"\)\s*===\s*"register"/);
    expect(SRC).toMatch(/setMode\("register"\)/);
  });

  it("handles ?reset_token=... by jumping straight to the reset step", () => {
    expect(SRC).toMatch(/params\.get\("reset_token"\)/);
    expect(SRC).toMatch(/setMode\("forgot"\)/);
    expect(SRC).toMatch(/setForgotStep\("reset"\)/);
    expect(SRC).toMatch(/setResetToken\(token\)/);
  });

  it("handles ?step=totp by calling the TOTP pending probe and entering the TOTP step", () => {
    expect(SRC).toMatch(/params\.get\("step"\)\s*===\s*"totp"/);
    expect(SRC).toMatch(/\/api\/auth\/totp\/pending/);
    expect(SRC).toMatch(/setTotpStep\(true\)/);
  });

  it("strips the reset_token, step=totp, and mode query strings from the URL after reading", () => {
    // Each of the three branches must call history.replaceState to avoid
    // leaving the token / step marker in the address bar.
    const matches = SRC.match(
      /window\.history\.replaceState\(\{\},\s*""\s*,\s*"\/login"\)/g,
    );
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("/login invite-code field", () => {
  it("renders the invite-code input with a plain <Input>, not SecureInput", () => {
    // Extract the JSX region that contains the invite-code label + input.
    const idx = SRC.indexOf('htmlFor="inviteCode"');
    expect(idx, 'expected an "inviteCode" label in login.tsx').toBeGreaterThan(
      -1,
    );
    const region = SRC.slice(idx, idx + 600);
    expect(region).toMatch(/<Input\b/);
    expect(region).not.toMatch(/<SecureInput\b/);
  });

  it("does not apply inactivity-timeout or masking props to the invite-code field", () => {
    const idx = SRC.indexOf('htmlFor="inviteCode"');
    expect(idx).toBeGreaterThan(-1);
    const region = SRC.slice(idx, idx + 600);
    expect(region).not.toMatch(/inactivityTimeout/);
    expect(region).not.toMatch(/onInactivityClear/);
    expect(region).not.toMatch(/alwaysMask/);
    expect(region).not.toMatch(/maskWhenBlurred/);
  });

  it("uses autoComplete=off on the invite-code field so password managers stay out", () => {
    const idx = SRC.indexOf('htmlFor="inviteCode"');
    expect(idx).toBeGreaterThan(-1);
    const region = SRC.slice(idx, idx + 600);
    expect(region).toMatch(/autoComplete=\s*"off"/);
  });
});
