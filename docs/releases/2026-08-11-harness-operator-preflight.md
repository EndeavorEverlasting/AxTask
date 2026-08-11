# Harness Operator Preflight Bootstrap

Status: candidate
Authority: `axtask.agent-authority.v1`

## Problem

A shell prompt can point at a folder named `AxTask` that is not a Git checkout. Starting operator instructions with `(git rev-parse --show-toplevel).Trim()` then produces a null-path cascade and can terminate the terminal before the harness gets a chance to route into repository-location recovery.

## Change

- add `scripts/ai-harness/operator-preflight.ps1` as a self-contained Windows bootstrap that can run from an unproven directory;
- accept a checkout only after Git resolves its top level and `origin` matches `EndeavorEverlasting/AxTask`;
- search bounded durable development roots plus shallow AxTask/worktree children;
- optionally fetch `origin/main` with `--no-force` while never merging, resetting, cleaning, initializing, deleting, or overwriting repository state;
- register the bootstrap in `.ai/harness.json`;
- make repository-location recovery require the bootstrap contract;
- make repository-location CI trigger when the bootstrap changes.

## Validation

Required before merge:

```text
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
node scripts/ai-harness/validate-repo-location-recovery.mjs
npm test
npm run check
npm run build
git diff --check <base>...HEAD
```

The dedicated repository-location workflow runs on both `ubuntu-latest` and `windows-latest`.

## Proof ceiling

Repository and CI proof can establish the bootstrap's tracked contract and non-repository checkout-resolution behavior. They do not prove the state of any operator workstation until the bootstrap is actually run there, and they do not prove Render, Neon, production database, or deployment state.
