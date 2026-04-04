import { describe, expect, it } from "vitest";
import { queryClient, DEFAULT_QUERY_STALE_TIME_MS } from "./queryClient";

describe("queryClient defaults (Phase A)", () => {
  it("uses offlineFirst network mode and reconnect refetch", () => {
    const defs = queryClient.getDefaultOptions().queries;
    expect(defs?.networkMode).toBe("offlineFirst");
    expect(defs?.refetchOnReconnect).toBe(true);
    expect(defs?.refetchOnWindowFocus).toBe(true);
    expect(defs?.staleTime).toBe(DEFAULT_QUERY_STALE_TIME_MS);
    expect(DEFAULT_QUERY_STALE_TIME_MS).toBe(5 * 60 * 1000);
  });
});
