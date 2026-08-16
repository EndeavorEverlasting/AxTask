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
- schema-valid runtime proof path when the failed workflow emitted one

## Procedure

1. Preserve the repository floor and unknown work.
2. Freeze the proof claim at the last passing gate.
3. If `runtime-proof.json` exists and validates, run `node scripts/ai-harness/summarize-runtime-failure.mjs <runtime-proof.json>` first. Treat `runtime-failure-summary.json` as the machine handoff and `runtime-failure-report.md` as the operator-readable failure view; do not substitute raw logs or assertion evidence.
4. If `workspaces.mjs doctor --strict-current` reports foreign/protected secondary worktrees that this failure-recovery task does not own, record and preserve them; do not clean, move, reset, or reclassify them merely to make workspace diagnostics green. Continue in a separate managed workspace when the intended triage workspace can be created safely and has no ownership collision. For that workspace, run `node scripts/ai-harness/validate-working-diff.mjs <workspace-path> --json` and require `semanticallyClean: true` instead of treating raw `git status` as the safety contract. `lineEndingOnly` is proven CRLF/LF checkout noise; staged, untracked, or `semanticTracked` entries are unique state and block the lane.
5. Classify the failure before proposing a repair.
6. Reproduce with the smallest targeted command.
7. Search current code, tests, scripts, manifests, and recent history for the existing contract.
8. Repair only owned files and add a regression check when practical.
9. Rerun the failed validator, its prerequisites, and then broader selected checks.
10. Write the failure report and update the operator report or handoff when work remains.

## Expected outputs

- `.ai/runs/<run-id>/runtime-failure-summary.json` and `.ai/runs/<run-id>/runtime-failure-report.md` for a failed runtime proof
- `.ai/runs/<run-id>/failure-report.md`
- updated run context and validator plan
- exact pass, fail, and skip results
- changed tracked files and commit evidence when repaired
- one bounded next owner and one exact next command when unresolved

## Guardrails

- no destructive cleanup
- no secret, command, assertion-evidence, or raw-log capture in runtime failure summaries
- no automatic live-system retry
- no proof escalation
- no ownership collision
- no repeated unchanged retries
- no treating unrelated workspace-policy violations as permission to disturb protected recovery work

## Tests

The harness completeness contract verifies that this skill, its workflow, its trigger, failure artifacts, runtime-proof triage, and semantic workspace-cleanliness gate stay registered and cross-referenced.
