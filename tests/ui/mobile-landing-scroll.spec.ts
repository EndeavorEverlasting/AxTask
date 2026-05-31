/**
 * Browser-reality test: the public landing page must be fully scrollable on
 * mobile viewports. This guards against #root { overflow: hidden } clipping
 * public pages that do not render inside an inner overflow-y:auto shell.
 *
 * Run against the real app (webServer must serve the client bundle).
 */
import { expect, test } from "@playwright/test";

test.describe.serial("Mobile landing page scroll", () => {
  test("/ scrolls fully on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Wait for the landing page shell to render
    await page.locator("header").waitFor({ state: "visible", timeout: 15_000 });

    // Assert the scrollable wrapper has content taller than the viewport
    const scrollable = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="public-scroll-shell"]');
      if (!shell) {
        return { scrollHeight: 0, clientHeight: 1 };
      }
      return {
        scrollHeight: shell.scrollHeight,
        clientHeight: (shell as HTMLElement).clientHeight,
      };
    });

    expect(
      scrollable.scrollHeight,
      "landing page should be taller than the mobile viewport",
    ).toBeGreaterThan(scrollable.clientHeight);

    // Scroll the wrapper to bottom and assert footer is visible
    await page.locator('[data-testid="public-scroll-shell"]').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(/AxTask/);
  });
});
