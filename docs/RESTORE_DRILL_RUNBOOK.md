# Restore Drill Runbook

## Purpose

Prove AxTask backups are usable before disaster forces the question.

## Frequency

Minimum:

- before production migration
- after major schema changes
- monthly for production backups

Preferred:

- weekly automated restore drill
- every production release

## Steps

1. Select latest trusted DB backup.
2. Verify SHA-256 hash.
3. Restore into staging or disposable database.
4. Run schema verification.
5. Run smoke API checks.
6. Compare table counts.
7. Record restore result.
8. Mark backup as restore-tested.

## Pass Criteria

- backup file exists
- manifest exists
- hash matches
- restore completes
- schema verification passes
- app smoke test passes
- table counts are sane

## Fail Criteria

- missing manifest
- hash mismatch
- restore failure
- schema verification failure
- table count collapse
- app cannot boot against restored DB
