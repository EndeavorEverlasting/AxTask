authorityRef: axtask.agent-authority.v1

# Workflow: parallel sprint intake and collision inspection

id: axtask.parallel-sprint-intake.v1

## Use when

More than one agent, writer, branch, or pull request targets the repository concurrently, or planned reliability sprints require path isolation before repository mutation begins.

## Required capability

`pr-collision-inspection`

## Inputs

- repository root
- planned sprint lane definitions (branches, owned paths)
- current open pull requests floor
- target base branch (default `main`)

## Steps

1. Run the PR collision inspection capability: `node scripts/ai-harness/inspect-pr-collisions.mjs --output .ai/runs/<run-id>/collision-ledger.json`.
2. Evaluate the returned overall risk level (`clean`, `low`, `medium`, `high`, `blocking`) and collision items.
3. If high-risk shared files (`package.json`, `server/routes.ts`, `shared/schema.ts`, etc.) are touched by multiple active lanes, assign explicit single-writer ownership or sequence lane launches.
4. Record the untracked collision ledger artifact under `.ai/runs/<run-id>/collision-ledger.json`.
5. Proceed to parallel sprint execution only when Gate G0 collision conditions are satisfied.

## Bounded retry policy

If `gh` CLI output is unavailable or unauthenticated, the capability falls back to local degraded mode and records the degraded reason. Do not retry GitHub API queries indefinitely.

## Stop conditions

Stop repository mutation in parallel lanes if a blocking critical collision on a shared core file exists without declared single-writer ownership, or if the base branch is conflicted.

## Outputs

- `.ai/runs/<run-id>/collision-ledger.json`
- Human-readable collision report summary

## Proof ceiling

Collision inspection proves path decoupling and risk ranking; it does not prove code correctness, build success, or runtime behavior.
