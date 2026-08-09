authorityRef: axtask.agent-authority.v1

# Workflow: pull request convergence and closeout

id: axtask.pr-closeout.v1

## Use when

An existing pull request should be repaired, rebased or rebuilt, validated, and merged or closed.

## Required skill

`axtask.skill.pr-closeout.v1`

## Inputs

- PR number
- current `main`
- PR head and changed files
- review threads and workflow checks
- owned and forbidden scope
- claimed `.ai/WORK_QUEUE.md` item when the PR advances a queued task

## Steps

1. Compare PR head to current `main`; do not trust stale green checks.
2. Read all changed files and unresolved review threads.
3. Identify collisions with merged work and open PR ownership.
4. Rebuild from current `main` when divergence or shared-surface drift makes direct merge unsafe.
5. Resolve valid review findings with bounded tests.
6. Run authority, harness, and work-queue validators when `.ai/`, `AGENTS.md`, harness scripts, or queue state change.
7. Run release, typecheck, tests, build, and relevant domain checks.
8. Confirm final diff contains only owned paths.
9. Merge with an expected-head SHA only after required checks pass and no explicit human-only approval or forbidden-scope gate remains.
10. If the PR belongs to a queue item, update its `Last proof`, `Gate`, and `Next action`. Mark `DONE` only when the item's acceptance gate is actually satisfied; otherwise advance to the next legitimate state instead of stopping at merge.
11. Report merge SHA, validation, skipped proof, and exact next command.

## Continuation rule

A green PR is not a handoff point when merge is safe and authorized. `REVIEW` and `MERGE` are continuation states in `.ai/WORK_QUEUE.md`; the active agent should repair, validate, and merge in the same session whenever tool access permits. After merge, continue to any remaining in-scope non-production checkpoint. Stop only at `DONE`, a concrete `BLOCKED` dependency, or an `OPERATOR` gate.

## Forbidden shortcuts

- merging because GitHub reports only that the PR is mergeable
- treating prior-head CI as current proof
- overwriting shared work without preserving reviewed content
- marking a queue item `DONE` because a PR opened, CI turned green, or a merge occurred when its acceptance gate requires more
- claiming deployment from merge or CI evidence
