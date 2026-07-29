# Account Backup Runner Preservation Boundary

**Date:** 2026-07-29  
**Source:** backup-only analysis of superseded PR #104 at `d20bfa8e19b4e200c467bb2dcf4876d37860ed6a`

## Preserved direction

PR #104 established useful scaffolding for a future local backup-certification lane:

- orchestration from a dedicated Node.js runner;
- reuse of `scripts/db/preflight-backup.mjs`, `scripts/db/restore-test.mjs`, and `latestDbManifest()`;
- per-run artifacts under `.ai/runs/<run-id>/`;
- machine-readable proof plus a human-readable report;
- explicit separation between source and restore database URLs.

The original source remains available on branch `feat/skill-tree-and-backup-certification` at `scripts/db/run-local-backup-cert.mjs`. It was not copied as executable code onto this clean branch because its current semantics are not safe or truthful enough to register as an available capability.

## Rejected content

The following PR #104 behavior must not be carried forward unchanged:

1. `ALLOW_PRODUCTION_TEST=1` can bypass the Neon URL rejection; account certification must fail closed for production-like URLs.
2. A failed backup preflight is recorded but is not included in `overallOk`.
3. A skipped restore can still produce overall status `PASSED`.
4. Manifest existence proves dump mechanics, not an account-level export/import or restore round trip.
5. The proposed capability claimed `local-disposable-runtime` and `available` without required disposable source/target identity and parity proof.
6. The combined release note mixed Skill Tree and backup ownership.

## P01 implementation gate

The clean P01 lane must implement and prove:

- disposable source and target PostgreSQL enforcement;
- deterministic synthetic account data;
- account identity, row-count, field-parity, relationship, and cross-account leakage checks;
- source non-mutation;
- restore/import failure as a terminal failure rather than a successful skip;
- a versioned result schema and truthful terminal states;
- capability registration only after the focused disposable-database proof passes.

## Ownership

- Branch: `feat/account-backup-roundtrip-cert`
- Owned future scope: account-level round-trip certification and its harness artifacts
- Forbidden future scope: production Neon, Render deployment, real account data, Skill Tree implementation

## Validation

This preservation commit is documentation-only. It records the exact reusable direction and the exact rejected proof claims. It does not execute or certify backup behavior.

## Proof ceiling

Historical diff inspection and preservation analysis only. No dump, restore, account round trip, disposable database, production recovery, or deployment proof is claimed.
