# 2026-08-11 — Fail-closed operator and R3 prerequisite gates

## Scope

This release closes the repeated operator-stall path exposed by PR #136 without touching application behavior or production state.

## Changes

- repository-location bootstrap distinguishes the first canonical checkout (`primary`) from the artifact-capable checkout (`selected`);
- `requiredArtifactAvailable` now requires both the tracked Git object and the materialized file in `selected`, so dirty/sparse checkouts cannot falsely advertise an executable artifact;
- `-Fetch -EnsureArtifactWorktree` reuses or creates a detached exact-`origin/main` sibling worktree when the first checkout cannot materialize the required artifact;
- no-checkout bootstrap acquisition is pinned to immutable reviewed revision `a50fa0c1353ed2e0a9f45c3da112a0bd4d03493b`, which contains the JSON-safe exact-worktree repair; mutable `main` is fetched only as repository state to inspect/select, not executed as bootstrap authority;
- R3 `--no-ledger` preflight enforces source/restore separation, protected local storage configuration/writability, PostgreSQL client availability, source database size, disposable restore connectivity, and free-space capacity before spawning the dump regardless of source hostname;
- direct `db:backup -- --no-ledger` invokes the same recovery prerequisite gate before `pg_dump`, so the recovery preflight cannot be bypassed by calling the underlying backup script directly;
- PostgreSQL target identity rejects URI query parameters that can override host/port/database/service routing, preventing a lexical loopback URL from redirecting recovery restore to the source target;
- loopback classification normalizes bracketed IPv6 so `[::1]` behaves as local/disposable instead of being misclassified;
- generic `db:backup:preflight` remains available to the existing migration/push airlock when `--no-ledger` recovery mode is not requested;
- the recovery backup returns its exact manifest path through a private temporary result channel and prints `AXTASK_BACKUP_MANIFEST=<path>`; recovery restore requires that exact `--file` instead of selecting by newest mtime;
- recovery restore requires a source fingerprint, matching SHA-256, source-ledger skip, and loopback target before destructive `pg_restore`;
- focused regression coverage includes loopback/IPv6 source recovery safety, connection-target override rejection, direct-backup preflight ordering, competing-manifest selection, dirty materialized-artifact recovery, and the existing recovery-wave validator contract.

## Safety / proof ceiling

Repository and CI validation can prove the fail-closed code paths and synthetic stale/dirty-checkout behavior. They do not prove current Render suspension, production credentials, protected-storage capacity on the operator workstation, a successful production backup/restore, or any later recovery/deployment stage. No production database, provider, or deployment mutation is performed by this change.
