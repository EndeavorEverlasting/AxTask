// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routesPath = path.join(projectRoot, "server", "routes.ts");
const shoppingListsRoutesPath = path.join(projectRoot, "server", "shopping-lists-routes.ts");
/** Registrar modules that call `app.METHOD(...)` outside `routes.ts` (must stay in sync with snapshot). */
const registrarRouteSources = [
  path.join(projectRoot, "server", "routes", "locations.ts"),
  path.join(projectRoot, "server", "routes", "reminders.ts"),
  path.join(projectRoot, "server", "routes", "ai.ts"),
];

/**
 * Paths registered as `app.METHOD("...",` or `app.METHOD(\n  "...",` in routes.ts.
 */
function extractExpressRoutePaths(source: string): string[] {
  const re = /app\.(get|post|put|patch|delete)\(\s*(?:\r?\n\s*)?["']([^"']+)["']/g;
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    paths.push(m[2]!);
  }
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

/** High-surface routes that should stay obvious in code review if removed. */
const REQUIRED_ROUTE_REGISTRATIONS = [
  'app.get("/api/tasks",',
  'app.post("/api/tasks",',
  'app.get("/api/tasks/search/:query",',
  'app.post("/api/tasks/recalculate",',
  'app.post("/api/auth/login",',
  'app.get("/api/auth/me",',
  'app.get("/api/gamification/wallet",',
  'app.get("/api/tasks/:id/classifications",',
  'app.post("/api/tasks/:id/confirm-classification",',
  'app.get("/api/alarm-capabilities",',
  'app.post("/api/alarm-companion/apply",',
] as const;

describe("server/routes.ts inventory", () => {
  it("keeps critical API registrations present", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    for (const snippet of REQUIRED_ROUTE_REGISTRATIONS) {
      expect(routes, snippet).toContain(snippet);
    }
  });

  it("matches snapshot of all Express path registrations", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    const shopping = fs.readFileSync(shoppingListsRoutesPath, "utf8");
    const registrarPaths = registrarRouteSources.flatMap((p) => extractExpressRoutePaths(fs.readFileSync(p, "utf8")));
    const merged = [
      ...new Set([...extractExpressRoutePaths(routes), ...extractExpressRoutePaths(shopping), ...registrarPaths]),
    ].sort((a, b) => a.localeCompare(b));
    expect(merged).toMatchSnapshot();
  });
});
