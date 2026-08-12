authorityRef: axtask.agent-authority.v1
skillId: axtask.skill.operator-preflight-bootstrap.v1

# Operator preflight bootstrap

## Trigger conditions

Use when a Windows operator is about to run repository-relative commands but the current directory has not yet been proven to be the canonical AxTask checkout, especially after `git rev-parse` or `git status` reports `not a git repository`.

## Required inputs

- Git installed and on PATH
- GitHub network access when `-Fetch` is requested
- expected repository identity `EndeavorEverlasting/AxTask`
- one or more durable development roots when the defaults are insufficient
- required tracked artifact, defaulting to `scripts/ai-harness/resolve-checkout.mjs`

## Procedure

1. Run `scripts/ai-harness/operator-preflight.ps1` from a tracked checkout, or download only that tracked file from `main` into temporary tooling when no checkout path is known.
2. Let the bootstrap search the current directory, its parent, and bounded durable development roots.
3. Accept only candidates whose Git top level resolves and whose `origin` is the canonical AxTask repository.
4. Use `-Fetch` only for a no-force `origin main` fetch; it does not merge, reset, clean, initialize, or overwrite the selected checkout.
5. Preserve any reported dirty work and route unrelated mutation through the managed workspace lifecycle.
6. For a command that depends on a tracked artifact, use `-Fetch -EnsureArtifactWorktree`. The bootstrap proves the required artifact exists at selected HEAD; if the first canonical checkout is stale, it reuses an exact-`origin/main` checkout or creates a detached durable sibling worktree at that exact SHA.
7. Do not invoke the resolver/workflow unless `requiredArtifactAvailable` is true. Use `selected`, not `primary`, as the artifact-capable checkout.

## Expected outputs

- canonical checkout path or exact no-checkout blocker
- original `primary` checkout plus artifact-capable `selected` checkout
- branch and selected HEAD evidence
- dirty/clean status without rewriting existing work
- optional fetched `origin/main` SHA
- `requiredArtifactAvailable` proof
- whether an exact-SHA worktree had to be created
- exact `Set-Location` next action only when the selected HEAD can actually run the required artifact

## Safety

Never use this skill to run `git init`, reset, clean, delete, or overwrite an occupied directory. Temporary downloaded bootstrap code is disposable tooling only and may not own unique sprint state. Exact-SHA recovery worktrees are detached and durable sibling worktrees, created only through the explicit `-EnsureArtifactWorktree` opt-in after a no-force fetch.
