# Migration automation

Use these after restore + `npm run db:push` on **`integration/migration-unified`** (tip **U**). See also [STAGING_CUTOVER_RUNBOOK.md](STAGING_CUTOVER_RUNBOOK.md).

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run migration:verify-schema` | Confirms all Drizzle app tables exist in `DATABASE_URL` (fails if any missing). |
| `npm run migration:smoke-api` | `GET /health` and `GET /ready` on `BASE_URL` (default `http://localhost:5000`). |
| `npm run migration:check` | Runs schema verify if `DATABASE_URL` set; prints reminders for `npm test`, `npm run build`, smoke. |
| `npm run migration:check:full` | Schema verify + `npm test` (`RUN_TESTS=1` via script). |

## PowerShell (backup / restore)

Requires [PostgreSQL client tools](https://www.postgresql.org/download/) (`pg_dump`, `pg_restore`) on PATH.

```powershell
$env:DATABASE_URL = "postgresql://..."   # source prod (read credentials from host dashboard)
.\scripts\migration\pg-backup.ps1 -OutFile .\backups\axtask-pre-cutover.dump

# Target staging (empty DB)
.\scripts\migration\pg-restore.ps1 -DatabaseUrl "postgresql://..." -BackupFile .\backups\axtask-pre-cutover.dump

cd <AxTask>
npm run db:push
npm run migration:verify-schema
npm run build
npm test
npm run dev   # then in another terminal:
npm run migration:smoke-api
```

## CI / Coderabbit

- **Coderabbit**: address review comments on the feature PR; re-run `npm run build` and `npm test` after fixes.
- **Optional CI job**: `npm run migration:check:full` with a disposable Postgres service and `DATABASE_URL` — only if you add a workflow; schema verify needs a real DB.

## Manual feature passes (not fully automatable)

After automated checks: log in, collaborators, admin migration tab, planner, voice bar, premium/MFA paths — track in [STAGING_CUTOVER_RUNBOOK.md](STAGING_CUTOVER_RUNBOOK.md).
