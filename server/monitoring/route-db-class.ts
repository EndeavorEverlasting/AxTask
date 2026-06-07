/** Classify routes by expected DB touch level for usage attribution. */
export type RouteDbTouch = "db_free" | "db_light" | "db_heavy" | "unknown";

const EXACT: Record<string, RouteDbTouch> = {
  "/health": "db_free",
  "/ops/status": "db_free",
  "/ready": "db_light",
};

const PREFIX: Array<[string, RouteDbTouch]> = [
  ["/api/admin/analytics/overview", "db_heavy"],
  ["/api/admin/security-events", "db_heavy"],
  ["/api/admin/organization-aptitude-trends", "db_heavy"],
  ["/api/admin/performance/heuristics", "db_heavy"],
  ["/api/admin/usage", "db_light"],
  ["/api/admin/storage", "db_light"],
  ["/api/admin/users", "db_heavy"],
  ["/api/tasks", "db_heavy"],
  ["/api/auth", "db_light"],
  ["/api/notifications", "db_light"],
];

export function classifyRouteDbTouch(path: string): RouteDbTouch {
  const normalized = path.split("?")[0] || "/";
  if (EXACT[normalized]) return EXACT[normalized];
  for (const [prefix, touch] of PREFIX) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return touch;
  }
  if (normalized.startsWith("/api/")) return "db_light";
  return "unknown";
}

export function parseRouteKey(routeKey: string): { method: string; path: string } {
  const space = routeKey.indexOf(" ");
  if (space <= 0) return { method: "GET", path: routeKey };
  return { method: routeKey.slice(0, space), path: routeKey.slice(space + 1) };
}
