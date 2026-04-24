/**
 * useBriefing — shared subscription to GET /api/planner/briefing.
 *
 * Both the sidebar (for the overdue badge) and the planner page (for
 * tiles + recommendations) consume the same briefing endpoint. Prior
 * to this hook each surface declared its own `useQuery(["/api/planner/briefing"])`
 * with its own refetch interval, which:
 *
 *   1. De-duped the *request* (React Query handles that) but NOT the
 *      subscription overhead — both subscribers ran `refetchInterval`
 *      timers and React Query's internal observer book-keeping.
 *   2. Let their shapes drift. The sidebar only needed overdue +
 *      dueWithinHour counts but typed the data as a trimmed object,
 *      while planner used the full payload. One lazy search for
 *      "/api/planner/briefing" showed three different shape contracts.
 *   3. Made polling intervals inconsistent (60s vs 60s vs 120s).
 *
 * This hook centralizes all of that:
 *
 *   - One canonical `BriefingData` shape.
 *   - One refetch interval (`PLANNER_BRIEFING_REFETCH_MS`) visible at
 *     the module level so callers don't drift.
 *   - Two exports: `useBriefing()` (full payload) and `useBriefingBadge()`
 *     (just the sidebar-sized counts). Both resolve from the same
 *     React Query entry so the hot path stays O(1) in subscribers.
 *
 * The interval is 60s in both places today; if we want to dial it down
 * later (e.g. 120s) the change happens here in one place.
 */
import { useQuery } from "@tanstack/react-query";
import type { Task } from "@shared/schema";

export const PLANNER_BRIEFING_QUERY_KEY = ["/api/planner/briefing"] as const;
export const PLANNER_BRIEFING_REFETCH_MS = 60_000;

export interface BriefingWeekDay {
  date: string;
  dayName: string;
  count: number;
  load: "none" | "light" | "moderate" | "heavy";
}

export interface BriefingData {
  today: string;
  overdue: { count: number; tasks: Task[] };
  dueToday: { count: number; tasks: Task[] };
  dueWithinHour: { count: number; tasks: Task[] };
  thisWeek: { total: number; days: BriefingWeekDay[] };
  topRecommended: (Task & { reason: string })[];
  totalPending: number;
  shopping: {
    count: number;
    tasks: Task[];
    repurchaseSuggestions: Array<{
      item: string;
      suggestedDate: string;
      confidence: number;
      reason: string;
      avgDays: number;
      lastPurchasedAt: string;
      source: "purchase_history" | "task_patterns" | "blended";
    }>;
  };
}

export interface BriefingBadgeData {
  overdueCount: number;
  dueWithinHourCount: number;
  /** sum used by the sidebar's "needs attention" pill */
  attentionCount: number;
}

export function useBriefing() {
  return useQuery<BriefingData>({
    queryKey: PLANNER_BRIEFING_QUERY_KEY,
    refetchInterval: PLANNER_BRIEFING_REFETCH_MS,
  });
}

/**
 * Lean subscription for surfaces that only need the two badge numbers.
 * We reuse the same cache entry as `useBriefing()` by selecting the
 * relevant slice via React Query's `select`, which keeps the observer
 * stable on the same data and avoids re-rendering the sidebar when
 * unrelated fields (week grid, recommendations) change.
 */
export function useBriefingBadge() {
  return useQuery<BriefingData, Error, BriefingBadgeData>({
    queryKey: PLANNER_BRIEFING_QUERY_KEY,
    refetchInterval: PLANNER_BRIEFING_REFETCH_MS,
    select: (d): BriefingBadgeData => {
      const overdueCount = d?.overdue?.count ?? 0;
      const dueWithinHourCount = d?.dueWithinHour?.count ?? 0;
      return {
        overdueCount,
        dueWithinHourCount,
        attentionCount: overdueCount + dueWithinHourCount,
      };
    },
  });
}
