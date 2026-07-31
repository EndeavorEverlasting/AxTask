# Retire Obsolete Deployment Candidate Stub

**Date:** 2026-07-31

## Cleanup

Removed the planned `deployment-candidate-assembly` capability from `.ai/capability-registry.json`.

The capability pointed to `scripts/ops/Start-AxTaskDeploymentCandidate.ps1`, which was never implemented and has no repository references. Keeping it after the pre-deployment convergence work would leave a false executable surface in the canonical capability registry.

## Why it is obsolete

The current deployment flow no longer needs a separate candidate-assembly branch:

1. PR convergence produces a clean current `main`.
2. `predeploy-cost-readiness` evaluates the exact current-main candidate and repository gates.
3. `account-backup-roundtrip-certification` proves disposable recovery behavior.
4. `local-production-certification` launches and certifies the real production entrypoint against disposable PostgreSQL.
5. Live deployment remains a separately authorized operation.

A synthetic candidate-assembly capability would duplicate that flow without adding proof.

## Scope

- `.ai/capability-registry.json`
- this release record

No application code, database schema, deployment configuration, Render state, Neon state, or production behavior changes.

## Validation

Merge only after harness authority/completeness checks, release guard, full repository tests, production build, and the repository's existing disposable runtime certifications pass on the exact PR head.

## Proof ceiling

Repository cleanup only. Removing a nonexistent planned command does not authorize or perform deployment.
