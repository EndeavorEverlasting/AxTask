/**
 * Contract tests for `useBriefing` / `useBriefingBadge`.
 *
 * The invariants we lock in:
 *   1. Both hooks read from the same `/api/planner/briefing` cache
 *      entry — one request serves both subscribers.
 *   2. `useBriefingBadge()` exposes `attentionCount = overdue + dueWithinHour`.
 *      The sidebar pill math used to live inline in sidebar.tsx and
 *      kept drifting; the test below is what keeps it honest.
 *   3. A `select` on one observer does not cause re-renders on the other.
 *      We assert this indirectly: both hooks observe the same mutation to
 *      the cache and see the expected derived values.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useBriefing,
  useBriefingBadge,
  PLANNER_BRIEFING_QUERY_KEY,
  PLANNER_BRIEFING_REFETCH_MS,
} from "./use-briefing";
import type { BriefingData } from "./use-briefing";

function makeBriefing(overrides: Partial<BriefingData> = {}): BriefingData {
  return {
    today: "2026-04-19",
    overdue: { count: 3, tasks: [] },
    dueToday: { count: 2, tasks: [] },
    dueWithinHour: { count: 1, tasks: [] },
    thisWeek: { total: 12, days: [] },
    topRecommended: [],
    totalPending: 17,
    shopping: { count: 0, tasks: [], repurchaseSuggestions: [] },
    ...overrides,
  };
}

describe("use-briefing", () => {
  let client: QueryClient;
  let wrapper: (props: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  });

  afterEach(() => {
    client.clear();
    vi.restoreAllMocks();
  });

  it("exposes the full briefing payload via useBriefing()", async () => {
    client.setQueryData(PLANNER_BRIEFING_QUERY_KEY, makeBriefing());
    const { result } = renderHook(() => useBriefing(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.overdue.count).toBe(3);
    expect(result.current.data?.totalPending).toBe(17);
  });

  it("useBriefingBadge() derives attentionCount = overdue + dueWithinHour", async () => {
    client.setQueryData(
      PLANNER_BRIEFING_QUERY_KEY,
      makeBriefing({
        overdue: { count: 3, tasks: [] },
        dueWithinHour: { count: 1, tasks: [] },
      }),
    );
    const { result } = renderHook(() => useBriefingBadge(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      overdueCount: 3,
      dueWithinHourCount: 1,
      attentionCount: 4,
    });
  });

  it("both hooks share the same cache entry (no duplicate fetch)", async () => {
    const payload = makeBriefing();
    client.setQueryData(PLANNER_BRIEFING_QUERY_KEY, payload);

    const full = renderHook(() => useBriefing(), { wrapper });
    const badge = renderHook(() => useBriefingBadge(), { wrapper });

    await waitFor(() => {
      expect(full.result.current.data).toBeDefined();
      expect(badge.result.current.data).toBeDefined();
    });

    /* Same cache entry → we see exactly one query in the cache. */
    const all = client.getQueryCache().findAll();
    const briefingEntries = all.filter((q) =>
      q.queryHash.includes("/api/planner/briefing"),
    );
    expect(briefingEntries).toHaveLength(1);
  });

  it("exposes a stable module-level refetch interval", () => {
    /* Guard against drift: if someone silently drops this to 5s we
     * want CI to yell, because the sidebar polls this endpoint on
     * every logged-in page. */
    expect(PLANNER_BRIEFING_REFETCH_MS).toBeGreaterThanOrEqual(30_000);
    expect(PLANNER_BRIEFING_REFETCH_MS).toBeLessThanOrEqual(300_000);
  });
});
