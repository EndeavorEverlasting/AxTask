# Offline Phase D: safe persisted read cache

Phase D hardens **TanStack Query persistence** so cached GET data is less likely to leak across accounts on a shared browser and less likely to blow `localStorage` quotas.

## Per-user storage keys

Persisted query JSON is stored under **`axtask.react-query.v1.u.<userId>`**, using a sanitized user id, or **`axtask.react-query.v1.u.anon`** while the session is unknown (initial load) or on the login screen. Implementation: `getQueryPersistStorageKeyForUser` in `client/src/lib/query-persist-policy.ts` and `PersistedQueryLayer` in `client/src/lib/app-query-provider.tsx` (inside `AuthProvider`).

## Logout and login

- **Logout** calls `clearPersistOnLogout` so the legacy global key (if any), the signed-in user’s bucket, and the anon bucket are removed; the in-memory client is still cleared as before (`auth-context.tsx`).
- **Login / register** clears the **anon** bucket before adopting the new session so guest-phase blobs are not reused.

## Legacy migration

Installs that used the pre–Phase D single key **`axtask.react-query.v1`** drop it **once per browser profile** (`migrateLegacyQueryPersistStorageOnce`), tracked by `axtask.react-query.migrated-legacy-v1` in `localStorage`.

## Broader persist denylist

In addition to auth, admin, and billing, query keys under **`/api/invoices`**, **`/api/premium`**, **`/api/notifications`**, and **`/api/storage`** are excluded from persistence (`isPersistableQueryKey`).

## Size cap

Serialization uses `serializePersistedClientWithSizeCap` (default **~1.5MB** UTF-8) so oversized dehydrations fall back to persisting **mutations only** or an empty cache rather than failing a write.

## Build buster

**`VITE_QUERY_PERSIST_BUSTER`** still invalidates persisted blobs when the dehydrated shape changes; see Phase A / Docker docs.

## Related

- [OFFLINE_PHASE_A.md](./OFFLINE_PHASE_A.md) — read cache overview and connectivity UI.
- [OFFLINE_PHASE_C.md](./OFFLINE_PHASE_C.md) — offline task queue and conflicts.
