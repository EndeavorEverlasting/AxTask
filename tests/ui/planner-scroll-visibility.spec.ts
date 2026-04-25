import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const indexCss = fs.readFileSync(path.join(ROOT, "client", "src", "index.css"), "utf8");

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
