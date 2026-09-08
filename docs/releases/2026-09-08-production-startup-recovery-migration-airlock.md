# Production-startup recovery migration airlock — 2026-09-08

## Diagnosis

Immediately before the planned Render recovery, current Neon production evidence showed:

- database size approximately 36.20 GiB;
- `public.security_events` approximately 36.19 GiB total relation size;
- approximately 50.4 million estimated live `security_events` rows;
- PostgreSQL statistics identifying `api_request` as approximately 99.99667% of the event-type distribution;
- `trg_suppress_api_request_security_events` absent;
- `9999_disable_api_request_security_events.sql` absent from `applied_sql_migrations`.

The current repository still contains `migrations/9999_disable_api_request_security_events.sql`. That file creates the containment trigger **and deletes historical `api_request` rows older than one day**. `scripts/production-start.mjs` previously invoked the generic SQL migration runner without distinguishing ordinary schema migrations from recovery-only SQL.

That created an unacceptable failure mode: a Render restart/deploy could become the mechanism that performs the large recovery DELETE.

## Change

Normal app startup now invokes:

```text
node scripts/apply-migrations.mjs --production-startup
```

The migration runner classifies `9999_disable_api_request_security_events.sql` as recovery-only.

When all of the following are true, the runner exits non-zero **before applying any pending migration**:

1. `--production-startup` is present;
2. `DATABASE_URL` points to a non-loopback PostgreSQL target;
3. a recovery-only migration is still pending in `applied_sql_migrations`.

The failure is explicit:

```text
RECOVERY_ONLY_MIGRATION_PENDING
```

and directs the operator back to `docs/DB_RECOVERY_RUNBOOK.md`.

## Why loopback is allowed

CI and AxTask's local production certification deliberately replay the full migration set against disposable loopback PostgreSQL while running in production-like mode. Those databases are safe places to exercise migration `9999`, so loopback targets remain eligible for complete greenfield migration replay.

The existing `scripts/db/pg-tools.mjs` loopback classifier is reused rather than introducing a second target-identity implementation.

## Recovery and deployment path

This patch does not perform recovery and does not mark `9999` applied.

The intended production order remains:

1. complete the preservation/rollback prerequisites in `docs/DB_RECOVERY_RUNBOOK.md`;
2. establish `api_request` containment;
3. perform the authorized bounded logical cleanup;
4. make the R5/R6 physical-capacity decision;
5. deliberately run the ordinary migration runner **outside app startup** under its existing migration airlock so the recovery migration is recorded only after recovery prerequisites are satisfied;
6. deploy Render once from the exact certified `main` candidate.

No migration-ledger forgery or startup bypass flag is introduced.

## Rollout

Repository-only until merged. This change does not call Render or mutate Neon. After merge, an accidental Render start against the currently unrecovered database should stop with `RECOVERY_ONLY_MIGRATION_PENDING` rather than launching the historical cleanup.

## Rollback

Revert the merge commit if the startup classification itself regresses a legitimate deployment. Do **not** roll back by removing the recovery migration, fabricating an `applied_sql_migrations` row, or enabling a startup recovery bypass.

## Validation

Focused contract:

```bash
npx vitest run tests/deploy/04-migrations/migrations-contract.test.ts
```

Repository/deployment gates:

```bash
npm run test:deploy:migrations
node tools/ci/check-production-startup-guard.mjs
npm run release:check
npm run check
npm test
npm run build
git diff --check origin/main...HEAD
```

The exact-head CI local-production-certification and greenfield migration jobs must also remain green, proving that disposable loopback certification can still replay the complete migration set.

## Proof ceiling

This change proves startup behavior and prevents accidental recovery mutation during normal production startup. It does not prove R3 backup/restore, R1.5 account preservation, R4 cleanup, R5/R6 convergence, current Render environment values, or R8 deployment success.
