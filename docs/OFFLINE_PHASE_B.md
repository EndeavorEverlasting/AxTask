# Offline Phase B: device refresh session

Phase B adds a **long-lived device refresh token** (opaque, stored **hashed** in PostgreSQL) alongside the normal Passport **session cookie** (`axtask.sid`). The browser holds the plaintext only in an **httpOnly** cookie (`axtask.drefresh`).

## Behavior

1. **Issuance** — After any successful sign-in (local email/password, register auto-login, WorkOS, Google, Replit), the server creates a row in `device_refresh_tokens` and sets `axtask.drefresh`.
2. **Silent re-login** — On app load, the client calls `GET /api/auth/me`. If that returns **401** but the device cookie is still valid, it `POST`s **`/api/auth/refresh`** (with CSRF). The server validates the token, calls `req.login` to mint a new session, **rotates** the device token (old DB row removed, new cookie issued), and returns the safe user JSON.
3. **Logout** — `POST /api/auth/logout` revokes the current device token (if present), clears both cookies, and destroys the session.
4. **Limits** — Up to **15** device tokens per user (oldest pruned after each new issuance). Token lifetime **30 days** (rolling via rotation on each successful refresh).

## Schema

Table: `device_refresh_tokens` (see `shared/schema.ts`). Apply with:

```bash
npm run db:push
```

## Docker

Compose runs **`npm run db:push`** in the **`migrate`** service, so a normal **`npm run docker:up`** / **`docker:start`** stack gets this table without manual steps. See **[DOCKER_FOUNDATION.md](./DOCKER_FOUNDATION.md#offline-phase-b-device-refresh-database)** for caveats (old DB snapshots, shared machines, CSRF on refresh).

## Security

- Plaintext tokens never touch `localStorage` (Phase A cache already excludes `/api/auth/*`).
- **Shared machines:** use **Log out**, which revokes the device token for that cookie.
- Refresh uses the same **CSRF** rules as other `POST /api/*` calls.

## Related docs

- [OFFLINE_PHASE_A.md](./OFFLINE_PHASE_A.md) — persisted read cache and stale/offline UI.
- [OFFLINE_PHASE_C.md](./OFFLINE_PHASE_C.md) — offline task writes, queue, and conflicts.
