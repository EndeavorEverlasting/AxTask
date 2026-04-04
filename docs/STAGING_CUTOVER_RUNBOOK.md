# Staging DB, attachments, and production cutover

Use this after `integration/migration-unified` builds cleanly. **Do not commit secrets.**

## Prerequisites

- Production `DATABASE_URL` (or provider backup download) for the **current** live Postgres.
- Staging Postgres (empty database, same major version as prod when possible).
- Target production Postgres + app host for final cutover.

## Staging: restore and schema (tip **U**)

1. **Backup** live: `pg_dump` (custom format) or Neon/Render snapshot — see provider docs.
2. **Restore** into staging: `pg_restore` or `psql` into an empty DB.
3. On a checkout of **`integration/migration-unified`**, set `.env` **`DATABASE_URL`** to staging.
4. Run **`npm run db:push`** so the schema matches [shared/schema.ts](shared/schema.ts) at **U** (adds missing tables/columns; verify in staging before prod).
5. **Smoke test** both lines: collaborators/shared tasks, migration import/export admin tab, MFA/notifications/premium/admin security surfaces, voice + planner + tasks.

## Attachments (if prod uses disk storage)

1. On the **current** host, archive the directory used for uploads (default `storage/attachments`, or `ATTACHMENT_STORAGE_DIR`).
2. On the **new** host, extract to the same relative layout so `storageKey` paths in the DB still resolve ([server/services/attachment-storage.ts](../server/services/attachment-storage.ts)).
3. For Docker, populate the volume mounted at `/app/storage` (see [docker-compose.yml](../docker-compose.yml)).

## Production cutover

1. Take a **final** backup immediately before the window.
2. Restore to **target** Postgres; run **`db:push`** from **U** again if this is a fresh empty restore of prod data.
3. Deploy the app built from **`integration/migration-unified`**; set `DATABASE_URL`, `SESSION_SECRET`, OAuth vars.
4. DNS/TLS cutover per [docs/CUTOVER_RUNBOOK.md](CUTOVER_RUNBOOK.md); keep old DB read-only for rollback ([docs/MORNING_NEW_BOX_MIGRATION_CHECKLIST.md](MORNING_NEW_BOX_MIGRATION_CHECKLIST.md)).

## After Replit commits `008a8b0` / `afe5210` land on `origin`

Merge or cherry-pick those commits into `integration/migration-unified` if any files are missing, then repeat `npm run build` and staging validation.
