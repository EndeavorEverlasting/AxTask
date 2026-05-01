/**
 * Browser-reality smoke pass for the 10 auth/confirmation URLs the operator
 * checklist calls out. Assertions are intentionally DOM-level only — subjective
 * polish (typography, gradient hue, mobile feel, "does this sell AxTask?") is
 * deferred to the manual browser checklist in the ship summary.
 *
 * What we lock in here:
 *   - No blank page / missing chrome.
 *   - Query-string-driven states reach the right step (register / reset / totp).
 *   - /mfa/confirm with any missing param renders the amber invalid-link card
 *     and does NOT silently bounce the user into the app.
 *   - The happy-path /mfa/confirm renders the branded "Confirmation received"
 *     surface with a live redirect countdown.
 *   - /welcome-confirm renders the onboarding copy inside the Pretext shell.
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

test.describe("Auth + confirmation URL surfaces", () => {
  test("/login renders the branded pretext shell", async ({ page }) => {
    const errors = installConsoleErrorTrap(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/AxTask/);
    const signInOrKnown = page.locator(
      'button:has-text("Sign In"), button:has-text("Continue"), :text("Sign in with")',
    );
    await expect(signInOrKnown.first()).toBeVisible();
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

  test("first-time /login requires CTA click before showing email and password fields (progressive disclosure)", async ({ page }) => {
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
          providers: [],
        }),
      });
    });
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const primaryEmail = page.getByTestId("login-primary-email");
    await expect(primaryEmail).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("h2")).toContainText(/Sign in/i);

    // Assert Create account is visible on first-time shell
    await expect(page.getByRole("button", { name: /Create account/i })).toBeVisible();

    // Assert form is NOT visible yet
    await expect(page.getByRole("textbox", { name: /^email$/i })).not.toBeVisible();
    await expect(page.getByLabel(/^password$/i)).not.toBeVisible();

    // Click primary CTA
    await primaryEmail.click();

    // Assert form is visible
    await expect(page.getByRole("textbox", { name: /^email$/i })).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  });

  test("/login?mode=register switches to the register form", async ({ page }) => {
    await page.goto("/login?mode=register", { waitUntil: "domcontentloaded" });
    // Register mode shows a display-name field and a password strength bar.
    // The label text is "Display Name" — assert the shell is in register mode
    // by looking for either the display-name label or the create-account CTA.
    const registerMarkers = page.locator(
      ':text("Display Name"), :text("Create Account"), :text("Password Strength"), :text("strong password")',
    );
    await expect(registerMarkers.first()).toBeVisible({ timeout: 10_000 });
  });

  test("/login?reset_token=test jumps to the reset step and strips the token", async ({ page }) => {
    await page.goto("/login?reset_token=test", { waitUntil: "domcontentloaded" });
    // Page swallows the token and replaces the URL with /login.
    await expect(page).toHaveURL(/\/login(?!\?reset_token)/, { timeout: 10_000 });
    // Reset-step UI: new password / confirm password fields.
    const resetMarkers = page.locator(
      ':text("New Password"), :text("Confirm Password"), :text("Reset Password"), :text("Choose a new password")',
    );
    await expect(resetMarkers.first()).toBeVisible({ timeout: 10_000 });
  });

  test("/login?step=totp enters the TOTP step (when pending) or falls back gracefully", async ({ page }) => {
    await page.goto("/login?step=totp", { waitUntil: "domcontentloaded" });
    // The page calls /api/auth/totp/pending; in a smoke env with no session
    // that returns { pending: false } (or 401), and the page stays on the
    // default login shell. Either way the URL is cleaned up and the page is
    // not blank — that's the only thing we can universally assert without
    // seeding a session.
    await expect(page).toHaveURL(/\/login(?!\?step)/, { timeout: 10_000 });
    await expect(page.locator("body")).toContainText(/AxTask/);
  });

  test.describe("/mfa/confirm invalid-link state", () => {
    const INVALID_COPY = "This confirmation link is incomplete.";
    const NOT_CONFIRMED = "No confirmation was performed.";
    const REQUEST_NEW = "Request a new code";
    const BACK_TO = "Back to AxTask";

    test("with no params", async ({ page }) => {
      await page.goto("/mfa/confirm", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(INVALID_COPY, { timeout: 10_000 });
      await expect(page.locator("body")).toContainText(NOT_CONFIRMED);
      await expect(page.getByRole("button", { name: REQUEST_NEW })).toBeVisible();
      await expect(page.getByRole("button", { name: BACK_TO })).toBeVisible();
      // Must NOT silently bounce to the app.
      await expect(page).toHaveURL(/\/mfa\/confirm/);
    });

    test("with challengeId only (missing code + purpose)", async ({ page }) => {
      await page.goto("/mfa/confirm?challengeId=test", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(INVALID_COPY);
      const missingChip = page.locator(".font-mono").filter({ hasText: /code/ });
      await expect(missingChip.first()).toBeVisible();
      await expect(missingChip.first()).toContainText("code");
      await expect(missingChip.first()).toContainText("purpose");
    });

    test("with code only (missing challengeId + purpose)", async ({ page }) => {
      await page.goto("/mfa/confirm?code=123456", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(INVALID_COPY);
      const missingChip = page.locator(".font-mono").filter({ hasText: /challengeId/ });
      await expect(missingChip.first()).toBeVisible();
      await expect(missingChip.first()).toContainText("challengeId");
      await expect(missingChip.first()).toContainText("purpose");
    });

    test("with purpose only (missing challengeId + code)", async ({ page }) => {
      await page.goto("/mfa/confirm?purpose=account:verify_phone", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(INVALID_COPY);
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
    // Happy-path copy + CTA.
    await expect(page.locator("body")).toContainText(/Confirmation received|Sliding you back into AxTask/i, {
      timeout: 10_000,
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
    await expect(page.locator("body")).toContainText(/Welcome to AxTask/i, { timeout: 10_000 });
    await expect(page.locator("body")).toContainText(/AxTask Confirmation/);
    // Pretext shell mounts the ambient chip layer (aria-hidden but present).
    await expect(page.locator(".axtask-chip-layer")).toBeVisible();
    // Welcome path schedules the /-redirect countdown; assert the panel renders.
    await expect(page.locator("body")).toContainText(/Auto-redirect in/, { timeout: 5_000 });
    await page.getByRole("button", { name: "Stay here" }).click();
  });
});
