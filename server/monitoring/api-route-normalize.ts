/** UUID v4 pattern (Express `req.path` segments). */
const UUID_SEGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Collapse dynamic path segments so aggregates group "same" handlers (ids, numeric tails).
 * Used for admin API performance rollups over `security_events.route`.
 */
export function normalizeApiRouteForPerf(path: string | null | undefined): string {
  if (path == null || path === "") return "/";
  let p = path.startsWith("/") ? path : `/${path}`;
  p = p.replace(UUID_SEGMENT, ":id");
  p = p.replace(/\/\d+(?=\/|$)/gi, "/:num");
  return p;
}
