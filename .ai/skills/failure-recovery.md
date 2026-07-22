authorityRef: axtask.agent-authority.v1

# Skill: bounded failure recovery

id: axtask.skill.failure-recovery.v1

## Trigger conditions

Use this skill when `validator-or-workflow-failed` fires, a local hook blocks a commit or push, a CI job fails, or a workflow cannot continue at its current proof gate.

## Required inputs

- run context and validator plan
- exact command or job name
- exit code and sanitized error excerpt
- changed paths and owning lane
- branch, HEAD, base ref, and current proof ceiling

## Procedure

1. Preserve the repository floor and unknown work.
2. Freeze the proof claim at the last passing gate.
3. Classify the failure before proposing a repair.
4. Reproduce with the smallest targeted command.
5. Search current code, tests, scripts, manifests, and recent history for the existing contract.
6. Repair only owned files and add a regression check when practical.
7. Rerun the failed validator, its prerequisites, and then broader selected checks.
8. Write the failure report and update the operator report or handoff when work remains.

## Expected outputs

- `.ai/runs/<run-id>/failure-report.md`
- updated run context and validator plan
- exact pass, fail, and skip results
- changed tracked files and commit evidence when repaired
- one bounded next owner and one exact next command when unresolved

## Guardrails

- no destructive cleanup
- no secret or raw-log capture
- no automatic live-system retry
- no proof escalation
- no ownership collision
- no repeated unchanged retries

## Tests

The harness completeness contract verifies that this skill, its workflow, its trigger, and its failure-report artifact stay registered and cross-referenced.
