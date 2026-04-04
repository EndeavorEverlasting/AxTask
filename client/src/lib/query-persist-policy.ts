import type { Query } from "@tanstack/query-core";
import { defaultShouldDehydrateQuery } from "@tanstack/query-core";

/** localStorage key for TanStack Query persistence (Phase A). */
export const QUERY_PERSIST_STORAGE_KEY = "axtask.react-query.v1";

/** Buster string: bump in code or env when persisted shape must be discarded. */
export const QUERY_PERSIST_BUSTER =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_QUERY_PERSIST_BUSTER) || "v1";

/** How long persisted blobs are accepted before ignored (ms). */
export const QUERY_PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** After this long without a successful refetch, UI may show a stale hint (ms). */
export const STALE_DATA_WARNING_AFTER_MS = 10 * 60 * 1000;

const SENSITIVE_ROOT_PREFIXES = ["/api/auth", "/api/admin", "/api/billing"] as const;
// Note: /api/auth/* includes refresh (POST-only); no query key expected but stays excluded if added.

export function queryKeyRootString(queryKey: readonly unknown[]): string | null {
  const first = queryKey[0];
  return typeof first === "string" ? first : null;
}

/**
 * Whether this query key may be written to localStorage.
 * Auth, admin, and billing responses stay out of the persisted cache.
 */
export function isPersistableQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKeyRootString(queryKey);
  if (!root) return false;
  return !SENSITIVE_ROOT_PREFIXES.some((p) => root === p || root.startsWith(`${p}/`));
}

export function shouldDehydrateQueryForPersist(query: Query): boolean {
  if (!isPersistableQueryKey(query.queryKey)) return false;
  return defaultShouldDehydrateQuery(query);
}

export function clearQueryPersistStorage(): void {
  try {
    localStorage.removeItem(QUERY_PERSIST_STORAGE_KEY);
  } catch {
    /* private mode / SSR */
  }
}
