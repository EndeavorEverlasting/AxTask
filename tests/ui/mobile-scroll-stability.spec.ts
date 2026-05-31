/**
 * Synthetic mobile shell test: scroll down, then reverse direction and scroll
 * up, taking screenshots at each stage. Asserts bounded pixel diff so the
 * reversal does not produce a visible flash (nav hide/show, glass blur swap,
 * calm-mode blanking, etc.).
 *
 * Uses page.setContent() so it does not depend on the backend or webServer.
 * CSS is pulled from the production stylesheet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const indexCss = fs.readFileSync(
  path.join(ROOT, "client", "src", "index.css"),
  "utf8",
);

function diffPngBuffers(
  a: Buffer,
  b: Buffer,
): { changed: number; total: number } {
  const imgA = PNG.sync.read(a);
  const imgB = PNG.sync.read(b);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    throw new Error(
      `screenshot dimension mismatch: ${imgA.width}x${imgA.height} vs ${imgB.width}x${imgB.height}`,
    );
  }
  const total = imgA.width * imgA.height;
  const changed = pixelmatch(imgA.data, imgB.data, null, imgA.width, imgA.height, {
    threshold: 0.1,
  });
  return { changed, total };
}

const MOBILE_SHELL_HTML = `
  <style>
    ${indexCss}
    html, body { margin: 0; padding: 0; height: 100%; }
    body { background: #0b1020; color: #e5e7eb; font-family: Inter, system-ui, sans-serif; }
    #root { height: 100%; }
    .mobile-shell { height: 100%; display: flex; flex-direction: column; }
    .scroll-root { flex: 1; overflow-y: auto; padding: 16px; }
    .pad { height: 800px; }
    .nav { position: fixed; bottom: 0; left: 0; right: 0; height: 56px; z-index: 50; }
    .content { padding-bottom: 72px; }
    .card { border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; background: rgba(16,24,39,0.72); margin-bottom: 16px; padding: 12px; }
  </style>
  <div id="root">
    <div class="mobile-shell">
      <div class="scroll-root" data-surface="calm" id="scroll-root">
        <div class="content">
          <div class="pad"></div>
          <div class="card axtask-stable-panel" data-testid="content-panel">
            <p>Main content panel</p>
          </div>
          <div class="pad"></div>
        </div>
      </div>
      <div class="nav axtask-nav-chrome" data-testid="bottom-nav">
        <span style="display:flex;justify-content:space-around;align-items:center;height:100%;padding:0 16px;">
          <span>Home</span><span>Tasks</span><span>Calendar</span>
        </span>
      </div>
    </div>
  </div>
`;

test("mobile scroll direction reversal does not produce visible flash", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(MOBILE_SHELL_HTML);
  await page.evaluate(() => document.documentElement.classList.add("dark"));

  const panel = page.getByTestId("content-panel");
  await expect(panel).toBeVisible();

  // Settle baseline at scrollTop=100 — both screenshots must come from the
  // SAME scroll offset, otherwise this test measures normal content
  // movement instead of a direction-reversal flash.
  await page.locator("#scroll-root").evaluate((el) => {
    el.scrollTop = 100;
  });
  await page.waitForTimeout(150);
  const baseline = await page.screenshot();

  // Scroll down (away from baseline)
  await page.locator("#scroll-root").evaluate((el) => {
    el.scrollTop = 400;
  });
  await page.waitForTimeout(150);

  // Scroll back to the same offset as baseline (direction reversal)
  await page.locator("#scroll-root").evaluate((el) => {
    el.scrollTop = 100;
  });
  await page.waitForTimeout(150);
  const afterReversal = await page.screenshot();

  // Compare — same offset, so any non-trivial diff is a reversal flash.
  const diff = diffPngBuffers(baseline, afterReversal);
  const ratio = diff.changed / diff.total;

  // Tight threshold: 1% allows for anti-alias noise but catches real flashes.
  expect(
    ratio,
    `scroll reversal produced ${(ratio * 100).toFixed(2)}% pixel diff (threshold 1%)`,
  ).toBeLessThan(0.01);
});
