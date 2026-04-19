// @vitest-environment node
/**
 * Source-level contract test for the community page.
 *
 * The assertions below protect two perf invariants:
 *
 *  1. `PasteComposer` and `SafeMarkdown` stay lazy-loaded. They are
 *     the two heaviest sub-deps on /community (attachment pipeline +
 *     DOMPurify + marked) and neither is needed until the user expands
 *     a post. A naive static import would undo pass-3's bundle trim
 *     silently, so we guard the import line explicitly.
 *
 *  2. Feed rows carry `axtask-cv-row` and the CSS-only fade-in class
 *     instead of per-row `motion.div`. That keeps the tasks tab cheap
 *     as the feed grows, because the browser can skip off-screen
 *     layout via `content-visibility: auto`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(
  path.resolve(__dirname, "community.tsx"),
  "utf8",
);

describe("community page :: perf contract", () => {
  it("PasteComposer is lazy-loaded (not statically imported)", () => {
    /* The static `import { PasteComposer, ... }` form must not appear
     * at module scope; only the type re-import for PasteComposerValue
     * is allowed. */
    expect(src).not.toMatch(
      /import\s*\{[^}]*\bPasteComposer\b[^}]*\}\s*from\s*"@\/components\/composer\/paste-composer"/,
    );
    expect(src).toMatch(
      /const\s+PasteComposer\s*=\s*lazy\(\s*\(\)\s*=>\s*import\("@\/components\/composer\/paste-composer"\)/,
    );
  });

  it("SafeMarkdown is lazy-loaded", () => {
    expect(src).not.toMatch(
      /^import\s*\{[^}]*SafeMarkdown[^}]*\}\s*from\s*"@\/lib\/safe-markdown"/m,
    );
    expect(src).toMatch(
      /const\s+SafeMarkdown\s*=\s*lazy\(\s*\(\)\s*=>\s*import\("@\/lib\/safe-markdown"\)/,
    );
  });

  it("PasteComposer usage is wrapped in <Suspense>", () => {
    expect(src).toMatch(/<Suspense[^>]*>[\s\S]{0,200}<PasteComposer/);
  });

  it("SafeMarkdown usages are wrapped in <Suspense>", () => {
    /* Both the post body and per-reply renderings must be inside a
     * Suspense boundary or React will throw when the lazy chunk is
     * still loading. Allow ≤200 chars of whitespace + fallback JSX
     * between the opener and the lazy component. */
    const matches = src.match(/<Suspense[^>]*>[\s\S]{0,200}<SafeMarkdown/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("tasks feed rows use content-visibility (axtask-cv-row) and CSS fade-in", () => {
    expect(src).toContain("axtask-cv-row");
    expect(src).toContain("axtask-fade-in-up");
  });

  it("tasks feed no longer wraps each row in a framer-motion div", () => {
    /* The previous implementation rendered `<motion.div key={t.id} ...>`
     * inside an AnimatePresence loop. After pass-3 the row is a plain
     * `<div key={t.id} ...>`. Look for the exact pre-migration
     * signature and make sure it's gone. */
    expect(src).not.toMatch(/<motion\.div[^>]*key=\{t\.id\}/);
  });
});
