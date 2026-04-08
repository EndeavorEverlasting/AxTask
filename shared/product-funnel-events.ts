/** Client POST `/api/analytics/funnel` — session-scoped UI beacons only. */
export const PRODUCT_FUNNEL_CLIENT_EVENTS = ["planner_viewed", "community_feed_viewed"] as const;
export type ProductFunnelClientEvent = (typeof PRODUCT_FUNNEL_CLIENT_EVENTS)[number];
