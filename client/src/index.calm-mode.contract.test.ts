import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Stylesheet contract for calm-mode compositing suppression.
 *
 * The `data-axtask-calm` attribute is set on <body> by
 * animation-budget.ts while the user is scrolling / a longtask just
 * fired / the tab is hidden. These CSS rules drop the three heaviest
 * compositor inputs for that window so we don't pay for glass + aurora
 * + orb effects mid-scroll:
 *
 *   1. `backdrop-filter: blur(...)`     → re-sampled per frame
 *   2. `filter: blur(...)`              → full-resolution texture
 *   3. `will-change: transform`         → forced GPU layer
 *
 * If any of these rules disappears, the calm-mode RAM/scroll win
 * regresses. This contract test makes that regression loud before it
 * ships. Keep it pure string-match so it runs in under 50 ms with no
 * jsdom / css parsing overhead.
 */
const CSS = fs.readFileSync(
  path.resolve(__dirname, "index.css"),
  "utf8",
);

describe("calm-mode stylesheet contract", () => {
  it("drops backdrop-filter on the four glass/blur class families", () => {
    expect(CSS).toMatch(/body\[data-axtask-calm\][^{]*\.backdrop-blur-xl/);
    expect(CSS).toMatch(/body\[data-axtask-calm\][^{]*\.glass-panel-glossy/);
    expect(CSS).toMatch(
      /body\[data-axtask-calm\][^}]+backdrop-filter:\s*none\s*!important/,
    );
  });

  it("suppresses transition-all during calm-mode so scroll isn't jittered by hover transitions", () => {
    expect(CSS).toMatch(
      /body\[data-axtask-calm\]\s+\.transition-all\s*\{[^}]*transition-property:\s*none\s*!important/,
    );
  });

  it("drops `filter:` on aurora pseudos + orb layer", () => {
    const m = CSS.match(
      /body\[data-axtask-calm\]\s+\.axtask-aurora-body::before[^}]*\{[^}]*\}/,
    );
    expect(m?.[0]).toMatch(/filter:\s*none\s*!important/);
    expect(m?.[0]).toMatch(/animation-play-state:\s*paused\s*!important/);
    expect(CSS).toMatch(
      /body\[data-axtask-calm\][^{]*\.axtask-orb-layer[^}]*filter:\s*none/,
    );
  });

  it("clears `will-change` on orb / chip / glossy panels during calm-mode", () => {
    expect(CSS).toMatch(/body\[data-axtask-calm\][^{]*\.axtask-orb\b/);
    expect(CSS).toMatch(/body\[data-axtask-calm\][^{]*\[data-pretext-chip\]/);
    expect(CSS).toMatch(
      /body\[data-axtask-calm\][\s\S]+?will-change:\s*auto\s*!important/,
    );
  });

  it("applies opaque reader-surface fills to glass panels during calm-mode", () => {
    expect(CSS).toContain("Reader mask during calm-mode");
    expect(CSS).toMatch(
      /body\[data-axtask-calm\][\s\S]+?\.glass-panel[\s\S]+?background-color:\s*rgba\(255,\s*255,\s*255,\s*0\.93\)\s*!important/,
    );
    expect(CSS).toMatch(
      /\.dark\s+body\[data-axtask-calm\][\s\S]+?background-color:\s*hsla\(222,\s*47%,\s*10%,\s*0\.97\)\s*!important/,
    );
  });

  it("dims ambient chip layer opacity during calm-mode", () => {
    expect(CSS).toMatch(
      /body\[data-axtask-calm\]\s+\.axtask-chip-layer\s*\{[^}]*opacity:\s*0\.32/,
    );
  });
});
