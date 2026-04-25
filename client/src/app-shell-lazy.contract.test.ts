// @vitest-environment node
/**
 * Contract tests for the App shell's lazy-loaded chunks.
 *
 * Four surfaces here are opt-in: the global search dialog, typed command
 * palette, the voice command bar, and the bulk-action dialog. None of them are useful at
 * first paint — the user has to press a hotkey or accept a planner
 * review to see them. This test pins them as lazy imports so a
 * regression (e.g. someone converts them back to a static import)
 * shows up in CI instead of silently ballooning the initial chunk.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appSrc = fs.readFileSync(path.join(__dirname, "App.tsx"), "utf8");

describe("App shell :: lazy-load perf contract", () => {
  it("GlobalSearch is lazy-imported, not statically imported", () => {
    expect(appSrc).not.toMatch(
      /^import\s*\{\s*GlobalSearch\s*\}\s*from\s*"@\/components\/global-search"/m,
    );
    // May use `import(...).then((m) => ({ default: m.GlobalSearch }))` for named exports.
    expect(appSrc).toMatch(
      /const\s+GlobalSearch\s*=\s*lazy\([\s\S]*?import\("@\/components\/global-search"\)/,
    );
  });

  it("CommandPalette is lazy-imported", () => {
    expect(appSrc).not.toMatch(
      /^import\s*\{\s*CommandPalette\s*\}\s*from\s*"@\/components\/command-palette"/m,
    );
    expect(appSrc).toMatch(
      /const\s+CommandPalette\s*=\s*lazy\([\s\S]*?import\("@\/components\/command-palette"\)/,
    );
  });

  it("VoiceCommandBar is lazy-imported", () => {
    expect(appSrc).not.toMatch(
      /^import\s*\{\s*VoiceCommandBar\s*\}\s*from\s*"@\/components\/voice-command-bar"/m,
    );
    expect(appSrc).toMatch(
      /const\s+VoiceCommandBar\s*=\s*lazy\([\s\S]*?import\("@\/components\/voice-command-bar"\)/,
    );
  });

  it("BulkActionDialog stays lazy (pass-2 invariant)", () => {
    expect(appSrc).toMatch(
      /const\s+BulkActionDialogLazy\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*"@\/components\/bulk-action-dialog"\s*\)/,
    );
  });

  it("each lazy component is wrapped in <Suspense>", () => {
    // Anchor on null-fallback boundaries — the first <Suspense> in the file is the route tree, miles from GlobalSearch.
    expect(appSrc).toMatch(/<Suspense\s+[^>]*fallback=\{null\}[^>]*>\s*<GlobalSearch/);
    expect(appSrc).toMatch(/<Suspense\s+[^>]*fallback=\{null\}[^>]*>\s*<CommandPalette/);
    expect(appSrc).toMatch(/<Suspense\s+[^>]*fallback=\{null\}[^>]*>\s*<VoiceCommandBar/);
  });

  it("openGlobalSearch prefetches the chunk before setGlobalSearchOpen(true)", () => {
    /* Without this, Ctrl/Cmd+F could toggle open while Suspense still showed
     * a null fallback — the overlay never appeared until a second keypress. */
    expect(appSrc).toMatch(/case\s+"openGlobalSearch"/);
    expect(appSrc).toMatch(
      /import\("@\/components\/global-search"\)[\s\S]{0,120}setGlobalSearchOpen\(true\)/,
    );
  });
});
