import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Source-level contract: BulkActionDialog must stay out of the static
 * import graph of both App.tsx and planner.tsx so the shell + planner
 * chunks don't drag its framer-motion AnimatePresence subtree into the
 * first-paint path.
 *
 * If you intentionally move it back to a static import, delete this
 * file — but expect pages:bundle to regress by ~8-12 KB gzipped.
 */
const APP_SRC = fs.readFileSync(
  path.resolve(__dirname, "../App.tsx"),
  "utf8",
);
const PLANNER_SRC = fs.readFileSync(
  path.resolve(__dirname, "../pages/planner.tsx"),
  "utf8",
);

describe("BulkActionDialog lazy-load contract", () => {
  it("App.tsx does not statically import BulkActionDialog", () => {
    expect(APP_SRC).not.toMatch(
      /^\s*import\s+BulkActionDialog\s+from\s+["']@\/components\/bulk-action-dialog["']/m,
    );
    expect(APP_SRC).toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*["']@\/components\/bulk-action-dialog["']/,
    );
  });

  it("App.tsx wraps the dialog in <Suspense>", () => {
    expect(APP_SRC).toMatch(/<Suspense[^>]*>\s*<BulkActionDialogLazy/);
  });

  it("planner.tsx only keeps the ProposedAction type static; component is lazy", () => {
    expect(PLANNER_SRC).toMatch(
      /import\s+type\s+\{\s*ProposedAction[^}]*\}\s+from\s+["']@\/components\/bulk-action-dialog["']/,
    );
    expect(PLANNER_SRC).not.toMatch(
      /^\s*import\s+BulkActionDialog\b[^\n]*from\s+["']@\/components\/bulk-action-dialog["']/m,
    );
    expect(PLANNER_SRC).toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*["']@\/components\/bulk-action-dialog["']/,
    );
  });

  it("planner.tsx wraps the dialog in <Suspense>", () => {
    expect(PLANNER_SRC).toMatch(
      /<Suspense[^>]*>\s*<BulkActionDialog/,
    );
  });
});
