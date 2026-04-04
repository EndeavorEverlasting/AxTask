import { useMemo, type ReactNode } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { queryClient } from "./queryClient";
import {
  QUERY_PERSIST_BUSTER,
  QUERY_PERSIST_MAX_AGE_MS,
  QUERY_PERSIST_STORAGE_KEY,
  shouldDehydrateQueryForPersist,
} from "./query-persist-policy";

function buildPersistOptions() {
  const persister = createAsyncStoragePersister({
    storage: window.localStorage,
    key: QUERY_PERSIST_STORAGE_KEY,
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

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const persistOptions = useMemo(() => buildPersistOptions(), []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      {children}
    </PersistQueryClientProvider>
  );
}
