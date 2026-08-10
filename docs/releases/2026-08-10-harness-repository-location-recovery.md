# Harness repository-location recovery

Date: 2026-08-10
Scope: repository harness infrastructure only

## Problem

Repository commands could be started from a directory whose name suggested AxTask even though that directory was not a Git checkout. A failed top-level resolution could then leave an empty path variable, allowing later `git -C` commands to emit misleading secondary path errors. Some recovery flows also treated a checked-out `main` worktree as mandatory even though fetch and inspection only require any canonical checkout.

## Change

- Added `scripts/ai-harness/resolve-checkout.mjs` to prove checkout identity from Git top-level plus an exact recognized `EndeavorEverlasting/AxTask` origin.
- Added explicit recovery of primary, optional `main`, current, registered, and usable/non-prunable worktrees.
- Added `.ai/workflows/repository-location-recovery.md`, its scoped skill, trigger, operator report template, artifact registration, codebase-map entries, validator registration, and pre-push coverage.
- Added `scripts/ai-harness/validate-repo-location-recovery.mjs`, including a negative fixture where the current directory is named `AxTask` but is not a repository.
- Added cross-platform `Harness Repository Location Recovery` CI on Linux and Windows.
- Preserved the existing agent-workspace lifecycle as the sole authority for durable secondary worktrees and preserved the concurrently merged EOL-aware working-diff guidance.

## Safety boundaries

- No product runtime or application behavior changed.
- No governance contract changed.
- No database, Render, Neon, migration, deployment, or environment contract changed.
- No automatic Git-hook installation was introduced.
- The resolver does not initialize, reset, clean, delete, rename, or overwrite an occupied directory.
- Temporary bootstrap code may locate a durable checkout but may not own unique sprint state.

## Validation

Required proof for this change:

```bash
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
node scripts/ai-harness/validate-repo-location-recovery.mjs
npm run release:check
git diff --check <base>...HEAD
```

The dedicated repository-location workflow also runs its proof on Ubuntu and Windows. Existing repository CI remains authoritative for broader regression evidence.

## Rollback

Revert the merge commit for this release. No persistent application or data migration requires reversal.

## Proof ceiling

This release establishes repository-harness and local Git identity/worktree recovery proof only. It does not establish browser behavior, application runtime behavior, deployment success, Render state, Neon state, or production health.
