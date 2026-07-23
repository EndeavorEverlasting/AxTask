import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const indexCss = fs.readFileSync(path.join(ROOT, "client", "src", "index.css"), "utf8");

/** Diff two PNG buffers and return { changedPixels, totalPixels } using
 *  pixelmatch. A non-zero per-channel threshold (0.1) absorbs sub-pixel
 *  AA noise that browsers introduce between renders even when DOM is
 *  unchanged, so "near-identical" recovery passes deterministically. */
function diffPngBuffers(a: Buffer, b: Buffer): { changed: number; total: number } {
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

/** Population variance of luminance across all pixels in a PNG. Used as a
 *  cheap "structure preserved?" signal: a panel that has disappeared or
 *  flat-slabbed has near-zero variance (uniform fill); a panel showing
 *  text/decorations has non-trivial variance. We don't assert an absolute
 *  threshold — we compare against the baseline screenshot of the same panel
 *  so the test is independent of font hinting / OS chrome. */
function luminanceVariance(buf: Buffer): number {
  const img = PNG.sync.read(buf);
  const data = img.data;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += lum;
    sumSq += lum * lum;
    n += 1;
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

async function snapshotPanel(page: Page, testId: string): Promise<Buffer> {
  const handle = page.getByTestId(testId);
  await handle.waitFor({ state: "visible" });
  return await handle.screenshot();
}

test("planner-like panel inner content remains visible through calm/scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`
    <style>
      ${indexCss}
      html, body { margin: 0; padding: 0; height: 100%; }
      body { background: #0b1020; color: #e5e7eb; font-family: Inter, system-ui, sans-serif; }
      #root { height: 100%; }
      .shell { height: 100%; display: flex; flex-direction: column; }
      .scroll-root { flex: 1; overflow-y: auto; padding: 16px; }
      .pad { height: 420px; }
      .card { border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; background: rgba(16,24,39,0.72); margin-bottom: 16px; }
      .inner { padding: 12px 14px; }
      .transition-all { transition: all 300ms ease; }
      .muted { color: #9ca3af; font-size: 12px; }
    </style>
    <div id="root">
      <div class="shell">
        <div class="scroll-root" data-surface="calm" id="scroll-root">
          <div class="pad"></div>
          <section class="card axtask-stable-panel" data-testid="timeline-panel">
            <header class="inner"><strong>Task Timeline</strong></header>
            <div class="inner transition-all" data-testid="timeline-inner">Gantt body content</div>
          </section>
          <section class="card axtask-stable-panel" data-testid="insights-panel">
            <div class="inner axtask-stable-panel" data-testid="insights-inner">
              Patterns &amp; Insights content
            </div>
            <div class="inner muted">Secondary context row</div>
          </section>
          <div class="pad"></div>
        </div>
      </div>
    </div>
  `);

  const timelineInner = page.getByTestId("timeline-inner");
  const insightsInner = page.getByTestId("insights-inner");
  await expect(timelineInner).toBeVisible();
  await expect(insightsInner).toBeVisible();

  await page.evaluate(() => {
    document.body.setAttribute("data-axtask-calm", "1");
  });
  await page.locator("#scroll-root").evaluate((el) => {
    el.scrollTop = 380;
  });

  await expect(timelineInner).toContainText("Gantt body content");
  await expect(insightsInner).toContainText("Patterns & Insights content");

  const screenshot = await page.screenshot({ fullPage: true });
  expect(screenshot.byteLength).toBeGreaterThan(10_000);
});

const VISUAL_DIFF_HTML = `
  <style>
    ${indexCss}
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
      background: linear-gradient(135deg, hsl(222 47% 6%) 0%, hsl(222 39% 11%) 50%, hsl(237 48% 16%) 100%);
      color: #e5e7eb;
      font-family: Inter, system-ui, sans-serif;
    }
    .dark-shell { min-height: 100%; padding: 32px; display: grid; gap: 24px; }
    .panel-content { padding: 20px; }
    .panel-content h2 { margin: 0 0 8px; font-size: 14px; }
    .panel-content p { margin: 0; font-size: 12px; color: #cbd5e1; line-height: 1.5; }
  </style>
  <div class="dark-shell" id="root">
    <section class="glass-panel" data-testid="vd-glass-panel">
      <div class="panel-content">
        <h2>Glass panel (production class)</h2>
        <p>Calm-mode fill should fade in/out smoothly. Recovery must match baseline.</p>
      </div>
    </section>
    <section
      class="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl axtask-calm-blur-fallback"
      data-testid="vd-fallback-panel"
    >
      <div class="panel-content">
        <h2>Marker class (bare backdrop-blur + opt-in fallback)</h2>
        <p>Without the marker this panel would lose blur with no fallback fill and appear washed out.</p>
      </div>
    </section>
  </div>
`;

async function setCalmAndSettle(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.setAttribute("data-axtask-calm", "1");
  });
  await page.waitForTimeout(280);
}

async function clearCalmAndSettle(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.removeAttribute("data-axtask-calm");
  });
  await page.waitForTimeout(280);
}

test.describe("calm-mode glass-panel visual diff", () => {
  for (const testId of ["vd-glass-panel", "vd-fallback-panel"] as const) {
    test(`${testId}: baseline ≈ recovered after calm window, mid-calm differs but is bounded`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setContent(VISUAL_DIFF_HTML);
      await page.evaluate(() => {
        document.documentElement.classList.add("dark");
      });
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );

      const baseline = await snapshotPanel(page, testId);
      await setCalmAndSettle(page);
      const midCalm = await snapshotPanel(page, testId);
      await clearCalmAndSettle(page);
      const recovered = await snapshotPanel(page, testId);

      const recoveredDiff = diffPngBuffers(baseline, recovered);
      const recoveredRatio = recoveredDiff.changed / recoveredDiff.total;
      expect(recoveredRatio, `recovered vs baseline diff ratio for ${testId}`).toBeLessThan(0.005);

      const baselineVar = luminanceVariance(baseline);
      const midCalmVar = luminanceVariance(midCalm);
      expect(
        midCalmVar,
        `mid-calm luminance variance for ${testId} (baseline=${baselineVar.toFixed(2)}, mid-calm=${midCalmVar.toFixed(2)}) — panel may have disappeared`,
      ).toBeGreaterThan(0.3 * baselineVar);
    });
  }
});

test.describe.serial("mobile landing page scroll", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("header").waitFor({ state: "visible", timeout: 15_000 });
  });

  test("/ scrolls fully on a mobile viewport", async ({ page }) => {
    const shell = page.locator('[data-testid="public-scroll-shell"]');
    const dimensions = await shell.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: (element as HTMLElement).clientHeight,
    }));
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

    await shell.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const footer = page.locator("footer");
    await expect(footer).toBeInViewport();
    await expect(footer).toContainText(/AxTask/);
  });

  test("real public shell returns to a visually stable viewport after direction reversal", async ({ page }) => {
    const shell = page.locator('[data-testid="public-scroll-shell"]');
    await shell.evaluate((element) => {
      element.scrollTop = 260;
    });
    await page.waitForTimeout(420);

    const baselineScrollTop = await shell.evaluate((element) => element.scrollTop);
    const baseline = await page.screenshot();

    await shell.evaluate((element) => {
      element.scrollTop += 520;
    });
    await page.waitForTimeout(320);
    await shell.evaluate((element, target) => {
      element.scrollTop = Number(target);
    }, baselineScrollTop);
    await page.waitForTimeout(420);

    const returnedScrollTop = await shell.evaluate((element) => element.scrollTop);
    expect(Math.abs(returnedScrollTop - baselineScrollTop)).toBeLessThanOrEqual(1);

    const afterReversal = await page.screenshot();
    const diff = diffPngBuffers(baseline, afterReversal);
    const ratio = diff.changed / diff.total;
    expect(
      ratio,
      `production-shell reversal produced ${(ratio * 100).toFixed(2)}% pixel diff (threshold 3%)`,
    ).toBeLessThan(0.03);
  });
});
