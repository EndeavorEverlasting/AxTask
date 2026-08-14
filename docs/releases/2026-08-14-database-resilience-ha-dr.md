# Database resilience: managed HA and isolated disaster recovery

Date: 2026-08-14

## Summary

- Separates AxTask database **high availability** from **disaster recovery** so live replication/failover is never treated as a backup.
- Encodes the current Neon production architecture as managed HA with a stable writer endpoint, client reconnect expectations, provider storage replication, a 30-second recovery target, and non-production-only restart drills.
- Adds a read-only Neon readiness audit for the configured point-in-time-recovery target and writer/default-branch readiness.
- Adds six-hour custom-format PostgreSQL cold backups to an S3 security boundary that must have Versioning and Object Lock `COMPLIANCE` retention enabled before the source database is read.
- Splits live-backup and recovery IAM identities. The live identity can upload but is explicitly denied delete/retention-policy mutation; the recovery identity can read exact versions but cannot upload or delete.
- Adds exact-manifest restore to a disposable loopback PostgreSQL target and a loopback-only rogue-delete drill that can also prove destructive-write propagation across disposable replicas.
- Adds a dedicated systemd timer/runner so the cold-backup schedule is outside the AxTask web process.
- Adds focused static contract tests and GitHub Actions validation for this resilience surface.

## Safety boundaries

- No production database destructive test is authorized or performed by this release.
- The Neon compute-restart drill rejects default/primary branches, rejects production-like branch names, verifies that the supplied database host matches the declared endpoint, and requires an explicit confirmation token.
- The rogue-delete and cold-restore paths reject non-loopback database targets.
- Cold backup refuses staging inside the repository and refuses a bucket without Versioning plus Object Lock `COMPLIANCE` retention meeting the configured minimum.
- Restore requires an exact S3 manifest URI; there is no implicit `latest` selection.
- Database URLs, Neon API keys, AWS credentials, raw dumps, and runtime evidence remain outside Git.

## Database

No schema shape changes and no migration changes.

The production provider remains Neon PostgreSQL. Neon read replicas share the underlying data storage and therefore are not counted by the AxTask resilience contract as independent disaster-recovery copies.

## Operator configuration

`.env.example` now declares the operator-only variable names used by the resilience scripts. Values must be supplied through protected operator/host secret stores. The canonical procedures and variable semantics are in `docs/DATABASE_RESILIENCE.md`.

## Validation

Repository/static proof completed for the initial implementation commit:

- `node scripts/db/validate-resilience-config.mjs` — PASS.
- `node --test scripts/db/database-resilience.test.mjs` — PASS, 5/5 focused tests.
- `node --check` for all new executable database-resilience scripts — PASS.
- JSON parsing for the resilience and IAM policy contracts — PASS.
- GitHub Actions YAML parsing — PASS.
- `systemd-analyze verify ops/systemd/axtask-db-cold-backup.service ops/systemd/axtask-db-cold-backup.timer` — PASS.
- Dedicated `Database resilience contracts` GitHub Actions workflow — PASS on the initial implementation commit.
- Repository-wide TypeScript typecheck — PASS on the initial PR run.
- Repository-wide Vitest suite — PASS on the initial PR run: 261 test files passed, 1,877 tests passed; 4 files / 40 tests skipped by their existing gates.
- Root Docker build and runtime-image asset verification — PASS on the initial PR run.

The initial PR run then failed `npm run release:check` because `.env.example` and a `docs/releases/*.md` artifact had not yet been changed. This release note and the accompanying environment-contract commit close those two policy gaps; the updated branch must rerun the release guard and downstream build/runtime certification before merge.

## Rollout gates

1. Merge only after the updated PR CI is green.
2. Run the read-only Neon resilience audit from a protected operator context and resolve any provider-history/readiness gap separately.
3. Provision/configure the immutable S3 bucket and attach the live-writer and recovery-reader policies to separate identities.
4. Install the external backup runner/timer and prove one successful immutable manifest.
5. Restore that exact manifest to a disposable PostgreSQL target.
6. Run the loopback rogue-delete drill, adding disposable replica endpoints when replica-propagation proof is required.
7. Run the compute-restart drill only against a dedicated non-production Neon branch/application.

## Proof ceiling

This release establishes repository contracts and executable tooling. It does not claim that immutable S3 storage has been provisioned, the external timer is installed, the current Neon PITR window satisfies the new target, a real cold backup has completed, or provider failover/restore drills have passed. Those remain protected runtime/operator proof gates.
