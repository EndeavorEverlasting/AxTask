import type { QueryClient } from "@tanstack/react-query";

/** Matches React Query key used for wallet across the app. */
export const WALLET_QUERY_KEY = ["/api/gamification/wallet"] as const;

/** Apply an authoritative balance from a mutation response before toasts, so UI matches persisted state. */
export function setWalletBalanceCache(queryClient: QueryClient, balance: number): void {
  queryClient.setQueryData(WALLET_QUERY_KEY, (prev: unknown) => {
    if (!prev || typeof prev !== "object") return prev;
    return { ...(prev as Record<string, unknown>), balance };
  });
}
