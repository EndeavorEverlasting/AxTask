import { describe, expect, it } from "vitest";
import { queryClient, DEFAULT_QUERY_STALE_TIME_MS } from "./queryClient";

describe("queryClient defaults (Phase A)", () => {
  it("uses offlineFirst network mode and reconnect refetch", () => {
    const defs = queryClient.getDefaultOptions().queries;
    expect(defs?.networkMode).toBe("offlineFirst");
    expect(defs?.refetchOnReconnect).toBe(true);
    expect(defs?.staleTime).toBe(DEFAULT_QUERY_STALE_TIME_MS);
    expect(DEFAULT_QUERY_STALE_TIME_MS).toBe(5 * 60 * 1000);
  });

  it("disables window-focus and interval refetch by default to avoid jank", () => {
    // Tab-focus refetch caused scroll interruptions and long-task spikes
    // every time the user Alt-Tabbed back into AxTask. Surfaces that need
    // live data must opt in per-query with a deliberate refetchInterval.
    const defs = queryClient.getDefaultOptions().queries;
    expect(defs?.refetchOnWindowFocus).toBe(false);
    expect(defs?.refetchInterval).toBe(false);
  });
});
