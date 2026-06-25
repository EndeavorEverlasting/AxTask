// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routesPath = path.join(projectRoot, "server", "routes.ts");
const shoppingListsRoutesPath = path.join(projectRoot, "server", "shopping-lists-routes.ts");
const authRoutesPath = path.join(projectRoot, "server", "routes", "auth.ts");
/** Registrar modules that call `app.METHOD(...)` outside `routes.ts` (must stay in sync with snapshot). */
const registrarRouteSources = [
  path.join(projectRoot, "server", "routes", "locations.ts"),
  path.join(projectRoot, "server", "routes", "reminders.ts"),
  path.join(projectRoot, "server", "routes", "ai.ts"),
  path.join(projectRoot, "server", "routes", "foundry.ts"),
  path.join(projectRoot, "server", "routes", "account-backup.ts"),
  path.join(projectRoot, "server", "routes", "account.ts"),
  authRoutesPath,
  path.join(projectRoot, "server", "routes", "task-attachments.ts"),
  path.join(projectRoot, "server", "routes", "task-collaboration.ts"),
  path.join(projectRoot, "server", "routes", "patterns.ts"),
  path.join(projectRoot, "server", "routes", "alarms.ts"),
  path.join(projectRoot, "server", "routes", "collaboration.ts"),
  path.join(projectRoot, "server", "routes", "dm-e2ee.ts"),
  path.join(projectRoot, "server", "routes", "avatar.ts"),
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
const REQUIRED_IN_ROUTES_TS = [
  'app.get("/api/tasks",',
  'app.post("/api/tasks",',
  'app.get("/api/tasks/search/:query",',
  'app.post("/api/tasks/recalculate",',
  'app.get("/api/gamification/wallet",',
  'app.get("/api/tasks/:id/classifications",',
  'app.post("/api/tasks/:id/confirm-classification",',
] as const;

const REQUIRED_IN_AUTH_REGISTRAR = [
  'app.post("/api/auth/login",',
  'app.get("/api/auth/me",',
] as const;

const REQUIRED_IN_ALARMS_REGISTRAR = [
  'app.get("/api/alarm-capabilities",',
  'app.post("/api/alarm-companion/apply",',
] as const;

describe("server/routes.ts inventory", () => {
  it("keeps critical API registrations present", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    for (const snippet of REQUIRED_IN_ROUTES_TS) {
      expect(routes, snippet).toContain(snippet);
    }
    const authRoutes = fs.readFileSync(authRoutesPath, "utf8");
    for (const snippet of REQUIRED_IN_AUTH_REGISTRAR) {
      expect(authRoutes, snippet).toContain(snippet);
    }
    const alarmsRoutes = fs.readFileSync(
      path.join(projectRoot, "server", "routes", "alarms.ts"),
      "utf8",
    );
    for (const snippet of REQUIRED_IN_ALARMS_REGISTRAR) {
      expect(alarmsRoutes, snippet).toContain(snippet);
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

  /**
   * Admin usage capture is gated when DISABLE_OPS_SNAPSHOT is set (scheduled
   * resource controls). The route stays registered; semantics live in
   * server/scheduled-resource-controls.contract.test.ts.
   */
  it("keeps admin usage capture registered and gated by DISABLE_OPS_SNAPSHOT", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('app.post("/api/admin/usage/capture"');
    expect(routes).toContain("DISABLE_OPS_SNAPSHOT");
  });

  /** Phase-1 hardening: location/reminder registrars must keep these paths (regardless of snapshot drift). */
  it("always exposes location and reminder API paths from registrars", () => {
    const loc = fs.readFileSync(path.join(projectRoot, "server", "routes", "locations.ts"), "utf8");
    const rem = fs.readFileSync(path.join(projectRoot, "server", "routes", "reminders.ts"), "utf8");
    const locPaths = extractExpressRoutePaths(loc);
    const remPaths = extractExpressRoutePaths(rem);
    for (const p of ["/api/location-places", "/api/location-events"]) {
      expect(locPaths, p).toContain(p);
    }
    for (const p of ["/api/reminders", "/api/reminders/:id"]) {
      expect(remPaths, p).toContain(p);
    }
  });
});
