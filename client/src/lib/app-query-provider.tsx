import { useEffect, useMemo, type ReactNode } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { queryClient } from "./queryClient";
import { useAuth } from "./auth-context";
import {
  QUERY_PERSIST_BUSTER,
  QUERY_PERSIST_MAX_AGE_MS,
  clearQueryPersistStorageForUser,
  getQueryPersistStorageKeyForUser,
  migrateLegacyQueryPersistStorageOnce,
  serializePersistedClientWithSizeCap,
  shouldDehydrateQueryForPersist,
} from "./query-persist-policy";

function buildPersistOptions(storageKey: string) {
  const persister = createAsyncStoragePersister({
    storage: window.localStorage,
    key: storageKey,
    serialize: (client) => serializePersistedClientWithSizeCap(client),
  });

  return {
    persister,
    maxAge: QUERY_PERSIST_MAX_AGE_MS,
    buster: QUERY_PERSIST_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: shouldDehydrateQueryForPersist,
    },
  };
}

/**
 * Phase D: per-user `localStorage` keys and bounded serialization.
 * Must render inside `AuthProvider`.
 */
export function PersistedQueryLayer({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  const storageKey = useMemo(
    () => getQueryPersistStorageKeyForUser(loading ? null : (user?.id ?? null)),
    [loading, user?.id],
  );

  const persistOptions = useMemo(() => buildPersistOptions(storageKey), [storageKey]);

  useEffect(() => {
    migrateLegacyQueryPersistStorageOnce();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user?.id) {
      clearQueryPersistStorageForUser(null);
    }
  }, [loading, user?.id]);

  return (
    <PersistQueryClientProvider key={storageKey} client={queryClient} persistOptions={persistOptions}>
      {children}
    </PersistQueryClientProvider>
  );
}
