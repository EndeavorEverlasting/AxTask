import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { setWalletBalanceCache, WALLET_QUERY_KEY } from "./wallet-cache";

describe("setWalletBalanceCache", () => {
  it("patches balance on existing wallet query data", () => {
    const qc = new QueryClient();
    qc.setQueryData(WALLET_QUERY_KEY, { balance: 10, lifetimeEarned: 100 });
    setWalletBalanceCache(qc, 42);
    expect(qc.getQueryData(WALLET_QUERY_KEY)).toEqual({
      balance: 42,
      lifetimeEarned: 100,
    });
  });

  it("no-ops when cache is empty", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "setQueryData");
    setWalletBalanceCache(qc, 99);
    expect(spy).toHaveBeenCalled();
    expect(qc.getQueryData(WALLET_QUERY_KEY)).toBeUndefined();
  });
});
