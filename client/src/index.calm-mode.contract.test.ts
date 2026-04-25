import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Stylesheet contract for calm-mode compositing suppression.
 *
 * The `data-axtask-calm` attribute is set on <body> by
 * animation-budget.ts while the user is scrolling / a longtask just
 * fired / the tab is hidden. These CSS rules reduce animation and
 * ambient compositor pressure mid-scroll:
 *
 *   1. ambient `filter` drop on aurora/orb layer
 *   2. `will-change` reset for orb/chip surfaces
 *   3. pretext interaction animations are paused
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
  it("pauses pretext interaction animations during calm mode", () => {
    expect(CSS).toMatch(/body\[data-axtask-calm\][^{]*\.axtask-pretext-hud::before/);
    expect(CSS).toMatch(/body\[data-axtask-calm\][^{]*\.axtask-pretext-interactive/);
    expect(CSS).toMatch(/transition:\s*none\s*!important/);
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
});
