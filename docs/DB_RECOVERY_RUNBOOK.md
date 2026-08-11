# AxTask Database Recovery Runbook

## Production database capacity incident

**Incident date:** 2026-08-09  
**Current provider state:** Render web service suspended by operator  
**Production mutation status:** none performed by this repository sprint

## Verified live evidence

The failed Render startup reported:

- database size: **36.20 GB**
- `public.security_events`: **36.19 GB**
- `public.tasks`: **0.4 MB**
- `public.coin_transactions`: **0.2 MB**
- other listed application tables: roughly **0.1–0.2 MB each**
- `neon.max_cluster_size`: **16TB** provider hint
- capacity gate compared the database against an explicitly configured **10.00 GB operator budget** and hard-failed

This proves the deployment blocker is PostgreSQL storage concentrated in
`security_events`. It does **not** yet prove which `event_type` accounts for the
live rows. Repository history makes historical `api_request` telemetry the leading
hypothesis, but R1 must verify the production event mix before deletion.

Repository/Docker assets are not included in `pg_database_size()` unless the
application separately stored those bytes inside PostgreSQL.

## Recovery rules

- Keep Render suspended through R7.
- Do not use `AXTASK_SKIP_DB_CAPACITY_CHECK` as a shortcut.
- Do not run `db:push` or general production migrations to escape the incident.
- Do not truncate `security_events`.
- Do not delete any non-`api_request` security event as part of this recovery.
- Do not begin destructive cleanup until the account evidence gate and raw DB backup/restore gate are both complete.
- Do not treat `neon.max_cluster_size` as a billing-plan allowance.
- Do not reuse 10 GiB as an operator budget merely because an old repository comment used that number.
- Normal `scripts/production-start.mjs` never performs recovery mutations.

## Recovery acceleration — parallel sub-part wave

The preservation and local-certification gates are not all serial dependencies. Use
`docs/DB_RECOVERY_SUBPART_WAVE.md` to split the recovery across independent
sub-parts without weakening the mutation gates.

**Launch immediately, in parallel:**

- R1 production SELECT-only forensics in the protected operator context;
- R3 source-read-only raw backup + disposable restore proof;
- R7 disposable local production certification.

**Immediately after R1 is accepted, in parallel:**

- R1.5 portable account-evidence preservation;
- R2 containment assessment.

If R2 containment is already origin-active, record it and do not mutate it. If R2
requires a containment mutation, that mutation still waits for successful R3
backup/restore proof.

R4 remains the convergence mutation gate: it cannot start until R1.5 preservation,
R3 backup/restore, and origin-active R2 containment are all proven. R5/R6 follow
R4, and R8 remains blocked until R0-R7 are recorded.

This parallelization is an execution optimization, not a safety exception.

## R0 — Render suspended

**Gate:** production web service is visibly `Suspended`; auto-deploy is off.

Repository `render.yaml` also keeps `autoDeploy: false` during this recovery so a
merge to `main` cannot be treated as deployment authorization.

## R1 — read-only production forensics

Run only after loading `DATABASE_URL` through the operator's normal secret path:

```bash
node scripts/db-size-audit.mjs --forensics --json > production-audit.json
```

The audit is SELECT-only. Preserve the resulting artifact outside Git if it contains
operational metadata that should not be committed.

Required evidence:

- total DB size
- `security_events` relation/heap/index/TOAST size
- estimated live/dead tuples
- event-type counts and oldest/newest timestamps
- state of `trg_suppress_api_request_security_events`
- whether migration `9999_disable_api_request_security_events.sql` is recorded

**Decision:** do not perform targeted cleanup unless R1 confirms that
`api_request` is the removable historical class.

## R1.5 — account evidence preservation

Before deleting historical rows, create a portable account-focused evidence bundle
from the same source database while Render remains suspended.

The exporter uses a single `REPEATABLE READ READ ONLY` transaction, streams
account-linked records to JSONL, fsyncs evidence files and directory metadata,
hashes every artifact, and writes a SHA-256 manifest.

For production, the output directory must be an explicit absolute path on
operator-controlled protected storage:

```bash
ACCOUNT_EMAIL='user@example.com'
EVIDENCE_DIR='/mnt/encrypted/axtask-evidence'
node scripts/db/export-account-evidence.mjs \
  --email="$ACCOUNT_EMAIL" \
  --prod \
  --force-production \
  --output-dir="$EVIDENCE_DIR" \
  --api-request-mode=summary \
  --json
```

The default `summary` policy preserves meaningful account-linked security events
row-for-row while preserving the high-volume `api_request` class as count,
time-range, UTC daily-count, and tamper-evident first/last hash-chain anchors. It
does not delete or modify source rows.

If individual `api_request` rows are themselves required for the preservation
purpose and sufficient protected external storage is available:

```bash
ACCOUNT_EMAIL='user@example.com'
EVIDENCE_DIR='/mnt/encrypted/axtask-evidence'
node scripts/db/export-account-evidence.mjs \
  --email="$ACCOUNT_EMAIL" \
  --prod \
  --force-production \
  --output-dir="$EVIDENCE_DIR" \
  --api-request-mode=all \
  --batch-size=1000 \
  --json
```

The exporter writes `EXPORT_INCOMPLETE` immediately after creating its output
directory. It removes that sentinel only after a successful read-only snapshot,
durable artifact writes, and manifest creation. **Never remove the sentinel
manually.** If the command fails or the sentinel remains, the directory is not
preservation evidence.

After a successful exit:

1. confirm `EXPORT_INCOMPLETE` is absent;
2. verify `manifest.sha256`;
3. verify every per-file hash in `manifest.json`;
4. review the manifest's account-linking policy and `excludedTables` list;
5. create **two independently controlled copies** and verify hashes after each copy.

The JSONL bundle includes attachment database metadata/storage keys but not object
bytes. When attachment files are part of the required record set, separately copy
the object bytes to protected storage, hash them, and retain an object-copy manifest
before R4.

**Gate:** the account evidence bundle is complete and hash-verified, two
independently controlled verified copies exist, and any in-scope attachment object
bytes have their own verified copy manifest. See
`docs/ACCOUNT_EVIDENCE_PRESERVATION.md` for the full scope, exclusions,
third-party/shared-record boundary, and provider-portability procedure.

## R2 — containment status

If R1 shows `trg_suppress_api_request_security_events` exists and is enabled for
normal/origin writes, containment is already present; record that evidence and do
not mutate it.

If the trigger is missing, disabled, or replica-only, do not use normal startup to
repair it. After R3 backup/rollback evidence exists, use the one-off containment
tool.

Dry run:

```bash
node scripts/db-contain-api-request.mjs --json
```

Authorized non-loopback execution:

```bash
node scripts/db-contain-api-request.mjs --execute --confirm=CONTAIN_API_REQUEST --prod --force-production --json
```

That command installs/verifies only the suppression function and trigger. It:

- deletes no historical rows
- does not invoke the general migration runner
- does not bypass the migration airlock
- does not modify `applied_sql_migrations`
- does not start AxTask

## R3 — backup and rollback proof

R3 is a preservation lane and may proceed in parallel with R1. It does not depend
on R1.5; instead, R1.5 and R3 are both mandatory prerequisites before R4.

For the recovery path, create exactly one source-read-only backup and verify its
hash:

```bash
npm run db:backup:preflight -- --no-ledger
```

`db:backup:preflight` already invokes the backup tool, writes the dump and manifest,
and verifies the dump SHA-256. Do **not** run `npm run db:backup` again after this
command; doing so would create a redundant second dump.

The `--no-ledger` recovery mode prevents `scripts/db/backup.mjs` from inserting a
`backup_records` row into the source production database. The generated manifest
must record:

```text
sourceLedgerMode: "skipped"
```

Then restore the resulting backup into a disposable PostgreSQL instance that is
not the source database:

```bash
RESTORE_DATABASE_URL='postgres://...disposable...' npm run db:restore:test
```

The restore verifier rejects a restore target equal to `DATABASE_URL`, runs schema
verification, and records `restoreTestedAt` in the backup manifest after success.

**Gate:** a current protected backup exists, its SHA-256 verifies, the manifest
proves source-ledger skip, and a disposable restore proof is recorded.

The raw database dump and R1.5 account evidence bundle are complementary:

- raw DB dump = database-level rollback artifact;
- account evidence bundle = portable account/audit artifact with explicit hashes and provider-independent files.

Neither substitutes for the other before destructive cleanup, but they should be
produced in parallel when operator/runtime capacity permits.

## R4 — targeted logical cleanup

Only after R1 confirms historical `api_request` rows are the removable class and
**R1.5, R2, and R3 are complete**. Keep Render suspended while cleanup runs.

Dry run first:

```bash
node scripts/db-reclaim-api-request.mjs --retention-days=1 --json
```

Authorized non-loopback logical cleanup:

```bash
node scripts/db-reclaim-api-request.mjs --execute --confirm=YES --prod --force-production --retention-days=1 --json
```

Safety properties:

- requires the `api_request` suppression trigger to be origin-active before and after mutation
- deletes only `event_type='api_request'` older than the selected retention window
- each bounded DELETE batch commits independently
- default batch size is 5000 and is bounded by the CLI validator
- the DELETE predicate cannot target non-`api_request` rows
- non-`api_request` before/after counts are observational because other writers can change them; they are not treated as an atomic preservation snapshot
- verifies no eligible historical `api_request` rows remain while containment is still active
- never runs `VACUUM FULL` as a side effect
- never prints `DATABASE_URL`

Re-run the R1 audit after logical cleanup.

## R5 — physical reclaim, only if needed

Logical DELETE makes pages reusable inside PostgreSQL but may not reduce the
physical relation enough for the chosen operational policy.

First run the physical-reclaim dry run:

```bash
node scripts/db-reclaim-api-request.mjs --vacuum-full --json
```

If physical shrink is still required, choose the provider-supported maintenance
method after reviewing current Neon guidance. `VACUUM FULL` requires an exclusive
lock and is therefore a separate maintenance-window operation, never an automatic
follow-on to deletion.

Repository command, only when explicitly authorized:

```bash
node scripts/db-reclaim-api-request.mjs --vacuum-full --execute --confirm=VACUUM_FULL --prod --force-production --json
```

The command requires origin-active containment and zero eligible historical
`api_request` rows before the rewrite, then rechecks both containment and eligible
rows after the exclusive rewrite before it reports success.

## R6 — capacity policy and gate

Run:

```bash
node scripts/deploy/check-db-capacity.mjs
```

Interpretation:

- **budget variable absent:** report-only; actual size and provider hint are reported
- **valid explicit budget:** 75/85/90% warn/soft/hard thresholds apply
- **explicitly empty or malformed budget:** fatal configuration error; the limit is not silently disabled
- provider hint is informational and never becomes the denominator automatically

`AXTASK_DB_SIZE_BUDGET_BYTES` is an operator-selected operational/spend ceiling,
not a discovered Neon physical limit. If the current Render value was added from
the obsolete 10 GiB assumption, remove it or replace it only after the operator
deliberately chooses a current threshold from provider/budget evidence.

## R7 — local production certification

R7 may be executed in parallel with R1/R3 because it uses disposable local
PostgreSQL and does not prove or mutate production state.

Against disposable local PostgreSQL:

```bash
AXTASK_LOCAL_CERT=1 node scripts/deploy/run-local-cert.mjs
```

Also run the repository deploy validators and build. Local evidence must prove:

- production launcher starts against disposable PostgreSQL
- `/health` returns 200 without DB dependency
- `/ready` returns 200 against disposable DB
- client shell serves
- recovery scripts remain fail-closed and production-inert by default

Proof ceiling remains **local-runtime**.

## R8 — one authorized Render resume/deploy

Prerequisites:

- R0–R7 recorded, including R1.5 account-evidence preservation
- exact `main` SHA recorded
- Render branch = `main`
- health check = `/health`
- auto-deploy remains off for the recovery window
- environment gate verified
- capacity-policy decision recorded
- operator explicitly authorizes one live attempt

Resume once and observe logs. Do not queue a second deploy if resume already starts
one.

Expected startup order:

```text
Environment gate
DB capacity gate
SQL migrations
Drizzle push skipped on Render/non-interactive startup
server start
/health 200
```

## R9 — observation window

After live recovery:

- verify `api_request` count does not advance
- verify meaningful `api_error`/auth/admin events still work
- verify DB size trend is stable
- verify scheduled retention behavior
- decide separately whether/when to re-enable auto-deploy

## Rollback boundaries

- containment trigger installation is idempotent; do not drop it during an app rollback
- targeted logical cleanup is destructive and depends on both R1.5 account evidence and R3 raw backup for preservation/rollback
- `VACUUM FULL` is not a data rollback mechanism; it is physical compaction after logical cleanup
- normal migrations continue to own `applied_sql_migrations`; recovery scripts do not forge migration state

## Proof ceiling

Repository tests can prove the tools and safety contracts. They cannot prove:

- current production event composition
- successful production account evidence export/copy verification
- successful backup/restore
- production cleanup
- production physical reclaim
- deployment completion
- live observation

Those require R1/R1.5/R3/R4/R5/R8/R9 evidence respectively.

## Next production actions after this branch is merged

Do not idle all recovery work behind one R1 chat.

1. Keep Render suspended and run R1 in the protected operator context.
2. **In parallel now**, run R3 with `npm run db:backup:preflight -- --no-ledger` plus disposable `db:restore:test`.
3. **In parallel now**, run R7 local production certification and deployment/build validators.
4. As soon as R1 passes, launch R1.5 evidence preservation and R2 containment assessment as separate sub-parts.
5. Converge only when R1.5, R3, and R2 are proven; then advance R4.

See `docs/DB_RECOVERY_SUBPART_WAVE.md` for ownership, collision boundaries, exact
sub-part commands, and convergence gates.
