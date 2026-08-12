# 2026-08-11 — Fail-closed operator and R3 prerequisite gates

## Scope

This release closes the repeated operator-stall path exposed by PR #136 without touching application behavior or production state.

## Changes

- repository-location bootstrap now distinguishes the first canonical checkout (`primary`) from the artifact-capable checkout (`selected`);
- `-Fetch -EnsureArtifactWorktree` proves the required tracked artifact at selected HEAD and reuses or creates a detached exact-`origin/main` sibling worktree when the first checkout is stale;
- the fresh-agent README, recovery workflow, skill, validator, and Windows PowerShell CI path use the same artifact-capable bootstrap contract;
- R3 backup preflight validates source/restore separation, protected local storage configuration/writability, PostgreSQL client availability, source database size, disposable restore connectivity, and free-space capacity before spawning the dump;
- raw DB backups honor `BACKUP_LOCAL_DIR`, record their storage target/root in the manifest, and recovery restore revalidates hash, source fingerprint, source-ledger skip, and loopback target separation before destructive restore;
- the recovery-wave contract executes the real prerequisite-validation functions rather than only matching prerequisite labels.

## Safety / proof ceiling

Repository and CI validation can prove the fail-closed code paths and synthetic stale-checkout behavior. They do not prove current Render suspension, production credentials, protected-storage capacity on the operator workstation, a successful production backup/restore, or any later recovery/deployment stage. No production database, provider, or deployment mutation is performed by this change.
