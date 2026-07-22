authorityRef: axtask.agent-authority.v1

# Workflow: bounded failure recovery

id: axtask.failure-recovery.v1

## Use when

A registered validator, local hook, build, CI job, or workflow step fails or returns an unexpected non-zero result.

## Required skill

`axtask.skill.failure-recovery.v1`

## Inputs

- current run context and validator plan
- exact failing command or CI job
- exit code and minimal relevant output
- current branch, HEAD, base ref, and changed paths
- owned and forbidden scope
- last passing evidence and current proof ceiling

## Steps

1. Freeze the attained proof level at the last passing gate. Do not promote proof after a failed step.
2. Record the exact command, exit code, environment class, candidate SHA when applicable, and a sanitized error excerpt.
3. Classify the failure as one primary type: code defect, test defect, environment/tooling, stale branch or collision, permission/credential boundary, external service, or destructive/live boundary.
4. Reproduce with the smallest targeted command. Do not rerun the entire suite repeatedly before isolating the failure.
5. Inspect the failing path, current implementation, related tests, recent commits, and open-PR ownership before editing.
6. If the failure is inside owned scope, apply the smallest coherent repair and add or strengthen a regression check.
7. If the failure belongs to foreign dirt or another active owner, preserve it and use an isolated worktree or hand it back without overwriting.
8. Update the run context with the failure class, attempts, changed files, skipped checks, and revised validator plan.
9. Rerun the failed targeted validator first, then its declared prerequisites, then broader checks in registry order.
10. Produce `.ai/runs/<run-id>/failure-report.md`. If unresolved, also produce the operator report and compressed handoff with one exact next command.

## Bounded retry policy

- Do not repeat an unchanged failing command more than twice.
- Every retry must follow a concrete change in code, configuration, environment, or test setup.
- When the failure cannot be reproduced, record the differing environment and stop inventing a root cause.

## Stop conditions

Stop and hand off when safe progress requires destructive cleanup, secret disclosure, production mutation, unavailable credentials, an unauthorized live action, or modification of foreign work that cannot be isolated.

## Forbidden shortcuts

- deleting or resetting unknown work to make a validator pass
- weakening a contract instead of repairing the implementation
- treating flaky success as proof without recording the failed attempt
- pasting raw logs, credentials, connection strings, user data, dumps, or heap snapshots
- claiming build, launcher, runtime, deployment, or operator proof from a lower gate

## Outputs

- updated run context
- updated validator plan when the changed paths or workflow changed
- sanitized failure report
- bounded repair commit when the failure is owned
- operator report and final handoff when unresolved

## Proof ceiling

Failure recovery may restore only the proof levels actually rerun and observed. A repaired static test does not establish build, launcher, runtime, deployment, or operator acceptance.
