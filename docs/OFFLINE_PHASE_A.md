# Offline Phase A: persisted read cache and connectivity UI

This document describes **Phase A** of AxTask’s offline-capable roadmap: **read-through persistence** and **explicit offline / stale messaging**. It does **not** implement mutation queues, device tokens, or automatic conflict resolution (those are later phases).

## What shipped

1. **TanStack Query persistence** (via `@tanstack/react-query-persist-client` + `localStorage`)
   - Successful **GET** query data is dehydrated to `localStorage` under a **per-user** key from `getQueryPersistStorageKeyForUser` (`client/src/lib/query-persist-policy.ts`); see **[OFFLINE_PHASE_D.md](./OFFLINE_PHASE_D.md)** for isolation, denylist expansion, and size limits.
   - **Excluded from persistence** (not written to disk): sensitive API roots listed in `isPersistableQueryKey` (auth, admin, billing, invoices, premium, notifications, storage, and their subpaths).
   - **Logout** clears persisted buckets for that session and the in-memory query client (`auth-context.tsx`).

2. **Default query behavior** (`client/src/lib/queryClient.ts`)
   - `networkMode: "offlineFirst"` so the UI can keep showing the last successful data when the network is unavailable.
   - `staleTime` of five minutes, `refetchOnWindowFocus` and `refetchOnReconnect` enabled, and a long `gcTime` so entries remain eligible for persistence.

3. **Connectivity UI** (`client/src/components/offline-data-banner.tsx`)
   - **Restoring**: shown while the persisted cache is rehydrating.
   - **Offline**: prominent banner when `navigator.onLine` is false, with a **Retry sync** action (invalidates queries).
   - **Stale hint**: when online, if persisted-eligible data is still **stale** and was last updated more than **ten minutes** ago, a subtle bar offers **Refresh now**.
   - **Back online**: a toast and a full `invalidateQueries()` when the browser transitions from offline to online.

## Environment

- Optional **`VITE_QUERY_PERSIST_BUSTER`**: change this build-time value to invalidate all clients’ persisted caches after a breaking API/schema change (see `QUERY_PERSIST_BUSTER` in `query-persist-policy.ts`).
- **Docker:** Compose passes the same variable from `.env.docker` as an image **build arg**; rebuild after changing it. See **[DOCKER_FOUNDATION.md](./DOCKER_FOUNDATION.md#offline-phase-a-read-cache-and-rebuilds)**.

## Task conflict policy (future sync phases)

**Tasks:** When the server eventually accepts queued offline edits, AxTask will treat the **server version as authoritative at merge time**: if the same task was changed both locally (while offline) and on the server (or another device), the client will **surface a conflict** instead of silently overwriting. The user will choose whether to **keep local**, **keep server**, or **open both** for manual reconciliation; until that UX exists, **last successful server state wins** and offline mutations are not applied automatically. This keeps billing, sharing, and audit expectations predictable while Phase A only improves **read** resilience.

## Related commands

- Local stack: `npm run offline:start` (see root `README.md`).
- Tests: `npm run test` (includes persist policy, network hook, and banner tests).

## Next: Phase B

Device refresh tokens and `POST /api/auth/refresh` restore Passport when the session cookie is missing — see **[OFFLINE_PHASE_B.md](./OFFLINE_PHASE_B.md)**.

## Next: Phase C

Offline task mutation queue, server `baseUpdatedAt` conflicts, and resolution UI — see **[OFFLINE_PHASE_C.md](./OFFLINE_PHASE_C.md)**.

## Next: Phase D

Per-user persist keys, extra API denylist entries, bounded serialization, and legacy key migration — see **[OFFLINE_PHASE_D.md](./OFFLINE_PHASE_D.md)**.

## Security note

Persisted cache holds **application JSON** for allowed query keys on **this device**. Use **Log out** on shared machines. Sensitive routes are excluded from persistence; Phase D further reduces cross-account cache bleed on the same browser.
