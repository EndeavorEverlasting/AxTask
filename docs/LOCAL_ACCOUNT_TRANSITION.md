# Local account transition (same machine, same database)

This describes how to move from **ephemeral seeded development accounts** (emails and passwords are printed in the **dev server terminal** on startup when `NODE_ENV=development`) to a **real email** on your **local PostgreSQL** instance. It does **not** automatically merge tasks between users; that would be a separate product feature. For the full sign-in picture, see [SIGN_IN.md](./SIGN_IN.md).

## Local secrets (no manual generation)

- Run **`npm run local:env-init`** to create `.env` (if missing) and ensure a strong **`SESSION_SECRET`** is written into `.env` (the value is **never** printed).
- Or run **`npm run local:secrets-bootstrap`** if `.env` already exists but `SESSION_SECRET` is still a placeholder or too short.
- **`npm run offline:start`** runs the same bootstrap step before validating the environment.

Dev passwords are still printed only in the **server console** when `NODE_ENV=development` (see `server/seed-dev.ts`); they are not stored in `.env`.

## Manual path: use a real email on local Postgres

1. Ensure **`REGISTRATION_MODE`** allows sign-up in development (default is **open** when `NODE_ENV` is not production, see `server/routes.ts`).
2. Open the app, use **Create account** with your real email and a strong password.
3. Use that account for day-to-day work on the local database.
4. Ignore or stop using the seeded development accounts if you no longer need them.

Tasks created under a seed user **stay** on that user until you manually move them (e.g. export/import, SQL, or a future migration tool).

## Future work (not implemented)

- **Bulk reassignment** or **merge** of tasks from a seed user to a “real” user with audit and conflict rules aligned with offline/sync policy docs.

## Related

- [SIGN_IN.md](./SIGN_IN.md) — sign-in for Docker, local dev, and production.
- [OFFLINE_PHASE_A.md](./OFFLINE_PHASE_A.md) — read cache and stale/offline UI.
- [OFFLINE_PHASE_B.md](./OFFLINE_PHASE_B.md) — device refresh session.
