import type { Query } from "@tanstack/query-core";
import { defaultShouldDehydrateQuery } from "@tanstack/query-core";
import type { PersistedClient } from "@tanstack/query-persist-client-core";

/**
 * Pre–Phase D global key. Removed once per browser profile by
 * `migrateLegacyQueryPersistStorageOnce` so older installs do not keep a shared blob.
 */
export const QUERY_PERSIST_LEGACY_GLOBAL_KEY = "axtask.react-query.v1";

/** @deprecated Prefer `QUERY_PERSIST_LEGACY_GLOBAL_KEY` or `getQueryPersistStorageKeyForUser`. */
export const QUERY_PERSIST_STORAGE_KEY = QUERY_PERSIST_LEGACY_GLOBAL_KEY;

const MIGRATED_LEGACY_FLAG_KEY = "axtask.react-query.migrated-legacy-v1";

/** Buster string: bump in code or env when persisted shape must be discarded. */
export const QUERY_PERSIST_BUSTER =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_QUERY_PERSIST_BUSTER) || "v1";

/** How long persisted blobs are accepted before ignored (ms). */
export const QUERY_PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** After this long without a successful refetch, UI may show a stale hint (ms). */
export const STALE_DATA_WARNING_AFTER_MS = 10 * 60 * 1000;

/** Cap serialized JSON size to reduce quota failures and accidental huge writes. */
export const QUERY_PERSIST_MAX_SERIALIZED_BYTES = 1_500_000;

const SENSITIVE_ROOT_PREFIXES = [
  "/api/auth",
  "/api/admin",
  "/api/billing",
  "/api/invoices",
  "/api/premium",
  "/api/notifications",
  "/api/storage",
] as const;

function sanitizeUserIdForStorageKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function getQueryPersistStorageKeyForUser(userId: string | null | undefined): string {
  const base = "axtask.react-query.v1.u.";
  if (userId && userId.length > 0) {
    return `${base}${sanitizeUserIdForStorageKey(userId)}`;
  }
  return `${base}anon`;
}

export function queryKeyRootString(queryKey: readonly unknown[]): string | null {
  const first = queryKey[0];
  return typeof first === "string" ? first : null;
}

/**
 * Whether this query key may be written to localStorage.
 * Sensitive API roots stay out of the persisted cache.
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

export function serializePersistedClientWithSizeCap(
  client: PersistedClient,
  maxBytes: number = QUERY_PERSIST_MAX_SERIALIZED_BYTES,
): string {
  const enc = new TextEncoder();
  const stringify = (c: PersistedClient) => JSON.stringify(c);
  let s = stringify(client);
  if (enc.encode(s).length <= maxBytes) return s;
  const slim: PersistedClient = {
    ...client,
    clientState: {
      queries: [],
      mutations: client.clientState.mutations,
    },
  };
  s = stringify(slim);
  if (enc.encode(s).length <= maxBytes) return s;
  return stringify({
    ...slim,
    clientState: { queries: [], mutations: [] },
  });
}

function tryRemoveLocalStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* private mode / SSR */
  }
}

/** Removes the legacy global persist key once per profile (idempotent). */
export function migrateLegacyQueryPersistStorageOnce(): void {
  try {
    if (localStorage.getItem(MIGRATED_LEGACY_FLAG_KEY)) return;
    localStorage.removeItem(QUERY_PERSIST_LEGACY_GLOBAL_KEY);
    localStorage.setItem(MIGRATED_LEGACY_FLAG_KEY, "1");
  } catch {
    /* private mode / SSR */
  }
}

/** Clears only the pre–Phase D shared key (tests and one-off cleanup). */
export function clearQueryPersistStorage(): void {
  tryRemoveLocalStorageItem(QUERY_PERSIST_LEGACY_GLOBAL_KEY);
}

export function clearQueryPersistStorageForUser(userId: string | null | undefined): void {
  tryRemoveLocalStorageItem(getQueryPersistStorageKeyForUser(userId));
}

/** Logout: drop legacy blob, signed-in bucket, and guest bucket. */
export function clearPersistOnLogout(userId: string | null | undefined): void {
  clearQueryPersistStorage();
  clearQueryPersistStorageForUser(userId);
  clearQueryPersistStorageForUser(null);
}
