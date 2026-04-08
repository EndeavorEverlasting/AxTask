import type { ProductFunnelClientEvent } from "@shared/product-funnel-events";

const SESSION_KEY: Record<ProductFunnelClientEvent, string> = {
  planner_viewed: "axtask_funnel_planner_viewed",
  community_feed_viewed: "axtask_funnel_community_feed_viewed",
};

/**
 * One POST per browser tab session per event (sessionStorage), for roadmap triage.
 * No-op if storage is unavailable. Requires an authenticated session.
 */
export function sendProductFunnelBeacon(
  event: ProductFunnelClientEvent,
  meta?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  const key = SESSION_KEY[event];
  try {
    if (sessionStorage.getItem(key) === "1") return;
  } catch {
    return;
  }
  void fetch("/api/analytics/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(meta && Object.keys(meta).length > 0 ? { event, meta } : { event }),
  })
    .then((r) => {
      if (r.ok) {
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          /* ignore */
        }
      }
    })
    .catch(() => {});
}
