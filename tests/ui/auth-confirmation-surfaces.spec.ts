/**
 * Browser-reality smoke pass for the auth/confirmation URLs the operator checklist
 * calls out. Assertions are intentionally DOM-level only — subjective polish is
 * deferred to the manual browser checklist in the ship summary.
 *
 * White-flash / blank-shell guard: we wait for hydrated login/MFA markers so a
 * stalled bundle or empty #root fails loudly. Symptom matrix:
 * docs/AUTH_CONFIRMATION_SURFACE_STABILITY.md, docs/SCROLL_REFRESH_VISUAL_STABILITY.md
 *
 * Serial execution avoids hammering the single Playwright webServer with parallel
 * navigations (blank body flakes under heavy concurrency + reuseExistingServer).
 *
 * The spec does NOT wait out the 90 s redirect countdown on the happy-path URL.
 */
import { expect, test, type Page } from "@playwright/test";

/** Swallow API 500s that happen when DATABASE_URL/SESSION_SECRET aren't set in
 *  a smoke-only environment. All markers asserted below are static client-side
 *  DOM — no API success required. */
function installConsoleErrorTrap(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

async function waitForLoginShell(page: Page, search: string) {
  await page.goto(search, { waitUntil: "domcontentloaded" });
  await page.locator("#login-help-header").waitFor({ state: "visible", timeout: 30_000 });
}

test.describe.serial("Auth + confirmation URL surfaces", () => {
  test("/login renders the branded pretext shell", async ({ page }) => {
    const errors = installConsoleErrorTrap(page);
    await waitForLoginShell(page, "/login");
    await expect(page.locator("#login-help-header")).toContainText(/AxTask/);
    await expect(page.locator("#login-help-card")).toBeVisible();
    /* OAuth CTAs are <a>; password path uses #login-help-password-cta; known-account picker uses Continue as …. */
    await expect(
      page
        .locator(
          '#login-help-password-cta, #login-help-oauth a, button:has-text("Continue as")',
        )
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(errors, `unexpected pageerrors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("first-time /login surfaces primary email before OAuth (local primary)", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("axtask_known_accounts");
        localStorage.removeItem("axtask_last_email");
        localStorage.removeItem("axtask_last_provider");
      } catch {
        /* ignore */
      }
    });
    await page.route("**/api/auth/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          registrationMode: "open",
          inviteConfigured: true,
          authProvider: "local",
          loginUrl: "",
          providers: [
            { name: "google", loginUrl: "/api/auth/google/login" },
            { name: "workos", loginUrl: "/api/auth/workos/login" },
          ],
        }),
      });
    });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const primaryEmail = page.getByTestId("login-primary-email");
    const oauthHost = page.locator("#login-help-oauth");
    await expect(primaryEmail).toBeVisible({ timeout: 15_000 });
    await expect(oauthHost).toBeVisible();
    const oauthFollowsEmail = await page.evaluate(() => {
      const email = document.querySelector('[data-testid="login-primary-email"]');
      const oauth = document.getElementById("login-help-oauth");
      if (!email || !oauth) return false;
      return (email.compareDocumentPosition(oauth) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(oauthFollowsEmail).toBe(true);
  });

  test("/login?error=auth_failed shows OAuth error copy and cleans URL", async ({ page }) => {
    await waitForLoginShell(page, "/login?error=auth_failed");
    await expect(page.getByText("Authentication failed. Please try again.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("#login-help-header")).toContainText(/AxTask/);
    await expect
      .poll(() => new URL(page.url()).searchParams.has("error"), { timeout: 15_000 })
      .toBe(false);
  });

  test("/login?mode=register switches to the register form", async ({ page }) => {
    await waitForLoginShell(page, "/login?mode=register");
    await expect(page.getByRole("heading", { name: /Create your account/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel(/Name \(optional\)/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Create account$/i })).toBeVisible();
  });

  test("/login?reset_token=test jumps to the reset step and strips the token", async ({ page }) => {
    await page.goto("/login?reset_token=test", { waitUntil: "domcontentloaded" });
    const resetMarkers = page.locator(
      ':text("New Password"), :text("Confirm Password"), :text("Reset Password"), :text("Choose a new password")',
    );
    await expect(resetMarkers.first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.has("reset_token"), { timeout: 15_000 })
      .toBe(false);
  });

  test("/login?step=totp enters the TOTP step (when pending) or falls back gracefully", async ({ page }) => {
    await page.goto("/login?step=totp", { waitUntil: "domcontentloaded" });
    await page.locator("#login-help-header").waitFor({ state: "visible", timeout: 30_000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.has("step"), { timeout: 15_000 })
      .toBe(false);
    await expect(page.locator("#login-help-header")).toContainText(/AxTask/);
  });

  test.describe("/mfa/confirm invalid-link state", () => {
    const INVALID_COPY = "This confirmation link is incomplete.";
    const NOT_CONFIRMED = "No confirmation was performed.";
    const REQUEST_NEW = "Request a new code";
    const BACK_TO = "Back to AxTask";

    test("with no params", async ({ page }) => {
      await page.goto("/mfa/confirm", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(INVALID_COPY, { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(NOT_CONFIRMED, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: REQUEST_NEW })).toBeVisible();
      await expect(page.getByRole("button", { name: BACK_TO })).toBeVisible();
      // Must NOT silently bounce to the app.
      await expect(page).toHaveURL(/\/mfa\/confirm/);
    });

    test("with challengeId only (missing code + purpose)", async ({ page }) => {
      await page.goto("/mfa/confirm?challengeId=test", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(INVALID_COPY, { exact: true })).toBeVisible({ timeout: 30_000 });
      const missingChip = page.locator(".font-mono").filter({ hasText: /code/ });
      await expect(missingChip.first()).toBeVisible();
      await expect(missingChip.first()).toContainText("code");
      await expect(missingChip.first()).toContainText("purpose");
    });

    test("with code only (missing challengeId + purpose)", async ({ page }) => {
      await page.goto("/mfa/confirm?code=123456", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(INVALID_COPY, { exact: true })).toBeVisible({ timeout: 30_000 });
      const missingChip = page.locator(".font-mono").filter({ hasText: /challengeId/ });
      await expect(missingChip.first()).toBeVisible();
      await expect(missingChip.first()).toContainText("challengeId");
      await expect(missingChip.first()).toContainText("purpose");
    });

    test("with purpose only (missing challengeId + code)", async ({ page }) => {
      await page.goto("/mfa/confirm?purpose=account:verify_phone", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(INVALID_COPY, { exact: true })).toBeVisible({ timeout: 30_000 });
      const missingChip = page.locator(".font-mono").filter({ hasText: /challengeId/ });
      await expect(missingChip.first()).toBeVisible();
      await expect(missingChip.first()).toContainText("challengeId");
      await expect(missingChip.first()).toContainText("code");
    });
  });

  test("/mfa/confirm with all three params renders the happy-path confirmation", async ({ page }) => {
    await page.goto(
      "/mfa/confirm?challengeId=test&code=123456&purpose=account:verify_phone",
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText(/AxTask Confirmation/)).toBeVisible({ timeout: 30_000 });
    // Happy-path copy + CTA.
    await expect(page.locator("body")).toContainText(/Confirmation received|Sliding you back into AxTask/i, {
      timeout: 15_000,
    });
    await expect(page.locator("body")).toContainText(/AxTask Confirmation/);
    // MFA handoff is written to sessionStorage by storeMfaHandoffSession.
    // We read the key set through the shared helper — the exact storage key
    // is an internal contract, so we just assert *something* was written with
    // our challengeId.
    const hasHandoff = await page.evaluate(() => {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k) continue;
        const v = sessionStorage.getItem(k) ?? "";
        if (v.includes("challengeId") && v.includes("test") && v.includes("account:verify_phone")) {
          return true;
        }
      }
      return false;
    });
    expect(hasHandoff, "expected an MFA handoff payload in sessionStorage").toBe(true);
    // Redirect countdown panel is visible and live.
    await expect(page.locator("body")).toContainText(/Auto-redirect in/);
    // Cancel so the spec doesn't sit on the page for 90 s.
    await page.getByRole("button", { name: "Stay here" }).click();
    // Panel goes away after cancel.
    await expect(page.locator("body")).not.toContainText(/Auto-redirect in/);
  });

  test("/welcome-confirm renders the onboarding shell", async ({ page }) => {
    await page.goto("/welcome-confirm", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Welcome to AxTask/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/AxTask Confirmation/);
    // Pretext shell mounts the ambient chip layer (aria-hidden but present).
    await expect(page.locator(".axtask-chip-layer")).toBeVisible();
    // Welcome path schedules the /-redirect countdown; assert the panel renders.
    await expect(page.locator("body")).toContainText(/Auto-redirect in/, { timeout: 5_000 });
    await page.getByRole("button", { name: "Stay here" }).click();
  });
});
