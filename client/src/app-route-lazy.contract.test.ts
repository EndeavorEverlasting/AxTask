// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Route-level lazy-loading contract (Phase B of the perf/refactor sweep).
 *
 * Rationale: every non-critical page should be behind React.lazy so its
 * JS only loads when the user actually visits that route. A static
 * `import X from "@/pages/X"` silently pulls the page into the initial
 * chunk and bloats first paint.
 *
 * "Critical" = pages that must render on first paint without a Suspense
 * fallback flicker: the pre-auth landing page, the login screen, the
 * contact page, the authenticated home (Dashboard), the MFA/welcome
 * confirmation bridge, and the 404 fallback.
 */
const EAGER_PAGES = [
  "dashboard",
  "experience-confirm",
  "login",
  "landing",
  "contact",
  "not-found",
];

const LAZY_PAGES = [
  "tasks",
  "analytics",
  "calendar",
  "import-export",
  "google-sheets-sync",
  "checklist",
  "shopping",
  "planner",
  "mini-games",
  "rewards",
  "skill-tree",
  "premium",
  "billing",
  "account",
  "settings",
  "appeals",
  "feedback",
  "community",
  "collab-inbox",
  "video-huddle",
  "billing-bridge",
  "admin",
];

function readApp(): string {
  const appPath = path.join(__dirname, "App.tsx");
  return fs.readFileSync(appPath, "utf8");
}

describe("App.tsx route lazy-loading contract", () => {
  const src = readApp();

  it.each(LAZY_PAGES)("%s page is lazy-loaded", (page) => {
    const staticImport = new RegExp(
      `import\\s+[A-Za-z_][A-Za-z0-9_]*\\s+from\\s+["']@\\/pages\\/${page}["']`,
    );
    const lazyImport = new RegExp(
      `lazy\\s*\\(\\s*\\(\\)\\s*=>\\s*import\\s*\\(\\s*["']@\\/pages\\/${page}["']\\s*\\)`,
    );
    expect(src, `static import of /pages/${page} detected`).not.toMatch(
      staticImport,
    );
    expect(src, `expected lazy() import of /pages/${page}`).toMatch(lazyImport);
  });

  it.each(EAGER_PAGES)("%s page stays eagerly imported", (page) => {
    const staticImport = new RegExp(
      `import\\s+[A-Za-z_][A-Za-z0-9_]*\\s+from\\s+["']@\\/pages\\/${page}["']`,
    );
    expect(src, `/pages/${page} must remain eager`).toMatch(staticImport);
  });

  it("routes are wrapped in Suspense", () => {
    expect(src).toMatch(/<Suspense[^>]*fallback=\{[^}]*RouteFallback/);
  });
});
