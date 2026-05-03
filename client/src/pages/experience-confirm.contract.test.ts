// @vitest-environment node
/**
 * Contract tests for the /mfa/confirm + /welcome-confirm bridge page.
 *
 * What we lock in here:
 *   - The page parses challengeId, code, and purpose from window.location.search.
 *   - When any of those three is missing on an /mfa/confirm URL, the page
 *     takes an explicit `isInvalidMfaLink` branch and does NOT redirect
 *     to the app as if confirmation succeeded.
 *   - The invalid-link branch renders inside PretextConfirmationShell and
 *     PretextGlassCard (brand parity with the happy path).
 *   - The happy-path and invalid-link branches both keep the Pretext chrome.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
  path.join(__dirname, "experience-confirm.tsx"),
  "utf8",
);

describe("ExperienceConfirmPage URL parsing", () => {
  it("reads challengeId, code, purpose from the query string", () => {
    expect(SRC).toMatch(/q\.get\("challengeId"\)/);
    expect(SRC).toMatch(/q\.get\("code"\)/);
    expect(SRC).toMatch(/q\.get\("purpose"\)/);
  });

  it("handles the /welcome-confirm branch as a welcome mode", () => {
    expect(SRC).toMatch(/locationPath\.startsWith\("\/welcome"\)/);
  });
});

describe("ExperienceConfirmPage invalid-link state", () => {
  it("declares an isInvalidMfaLink flag guarded by the three query params", () => {
    expect(SRC).toMatch(
      /isInvalidMfaLink\s*=\s*mode\s*===\s*"mfa"\s*&&\s*\(!challengeId\s*\|\|\s*!code\s*\|\|\s*!purpose\)/,
    );
  });

  it("short-circuits the handoff / redirect effect when the link is invalid", () => {
    // The effect must return before it ever calls startRedirectCountdown.
    expect(SRC).toMatch(
      /if\s*\(isInvalidMfaLink\)\s*\{\s*return;?\s*\}/,
    );
  });

  // The render-branch and the useEffect short-circuit both start with
  // `if (isInvalidMfaLink) {`. We scope the render block by requiring the
  // `const missing = [` declaration that only the render-branch has.
  const RENDER_BLOCK_RE =
    /if\s*\(isInvalidMfaLink\)\s*\{\s*const\s+missing\s*=\s*\[[\s\S]*?<\/PretextConfirmationShell>\s*\);[\s\S]*?\n\s*\}/;

  it("renders the invalid-link surface inside PretextConfirmationShell + PretextGlassCard", () => {
    const block = SRC.match(RENDER_BLOCK_RE);
    expect(block, "expected an isInvalidMfaLink early-return block").toBeTruthy();
    const body = block![0];
    expect(body).toMatch(/<PretextConfirmationShell/);
    expect(body).toMatch(/<PretextGlassCard/);
  });

  it("shows an explicit failure headline and does not claim success", () => {
    expect(SRC).toMatch(/This confirmation link is incomplete\./);
    expect(SRC).toMatch(/No confirmation was performed\./);
    // Make sure the failure copy is not accidentally paired with the
    // happy-path redirect copy, which would re-introduce the silent redirect.
    const block = SRC.match(RENDER_BLOCK_RE);
    expect(block).toBeTruthy();
    expect(block![0]).not.toMatch(/Sliding you back into AxTask/);
    expect(block![0]).not.toMatch(/Your workspace is warming up/);
  });

  it("offers actionable recovery CTAs", () => {
    // Either CTA is fine but both must be present so the user can recover
    // from a bad link without being stranded.
    expect(SRC).toMatch(/Request a new code/);
    expect(SRC).toMatch(/Back to AxTask/);
  });
});
