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

## Steps

1. Compare PR head to current `main`; do not trust stale green checks.
2. Read all changed files and unresolved review threads.
3. Identify collisions with merged work and open PR ownership.
4. Rebuild from current `main` when divergence or shared-surface drift makes direct merge unsafe.
5. Resolve valid review findings with bounded tests.
6. Run authority and harness validators when `.ai/`, `AGENTS.md`, or harness scripts change.
7. Run release, typecheck, tests, build, and relevant domain checks.
8. Confirm final diff contains only owned paths.
9. Merge with an expected-head SHA only after required checks pass.
10. Report merge SHA, validation, skipped proof, and exact next command.

## Forbidden shortcuts

- merging because GitHub reports only that the PR is mergeable
- treating prior-head CI as current proof
- overwriting shared work without preserving reviewed content
- claiming deployment from merge or CI evidence
