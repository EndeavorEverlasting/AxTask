authorityRef: axtask.agent-authority.v1
skillId: axtask.skill.operator-preflight-bootstrap.v1

# Operator preflight bootstrap

## Trigger conditions

Use when a Windows operator is about to run repository-relative commands but the current directory has not yet been proven to be the canonical AxTask checkout, especially after `git rev-parse` or `git status` reports `not a git repository`.

## Required inputs

- Git installed and on PATH
- GitHub network access only when `-Fetch` is requested
- expected repository identity `EndeavorEverlasting/AxTask`
- one or more durable development roots when the defaults are insufficient

## Procedure

1. Run `scripts/ai-harness/operator-preflight.ps1` from a tracked checkout, or download only that tracked file from `main` into temporary tooling when no checkout path is known.
2. Let the bootstrap search the current directory, its parent, and bounded durable development roots.
3. Accept only candidates whose Git top level resolves and whose `origin` is the canonical AxTask repository.
4. Use `-Fetch` only for a no-force `origin main` fetch; the bootstrap does not merge or change the working tree.
5. Preserve any reported dirty work and route unrelated mutation through the managed workspace lifecycle.
6. Once a checkout is proven, run the tracked Node resolver for full worktree inventory and continue the owning workflow.

## Expected outputs

- canonical checkout path or exact no-checkout blocker
- branch and HEAD evidence
- dirty/clean status without file mutation
- optional fetched `origin/main` SHA
- exact `Set-Location` next action

## Safety

Never use this skill to run `git init`, reset, clean, delete, or overwrite an occupied directory. Temporary downloaded bootstrap code is disposable tooling only and may not own unique sprint state.
