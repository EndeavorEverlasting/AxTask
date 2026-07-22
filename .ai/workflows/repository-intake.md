authorityRef: axtask.agent-authority.v1

# Workflow: repository intake and first safe sprint

id: axtask.repository-intake.v1

## Use when

A fresh agent enters the repository, operational truth is uncertain, or a new sprint must be selected from current evidence.

## Required skill

`axtask.skill.repository-intake.v1`

## Inputs

- repository root
- target branch or PR when known
- user mission and forbidden scope
- existing worktree state

## Steps

1. Run the compact Git preflight through the read-only inspector.
2. Read repository law, harness manifests, current commits, open PR collisions, plans, validators, output policy, deployment seams, and codebase-map known traps.
3. Build a bounded run context.
4. Rank candidate sprints with evidence.
5. Select the smallest safe sprint that unblocks the most later work.
6. Modify tracked files, or prove the sprint already complete.
7. Run `node scripts/ai-harness/select-validators.mjs --context .ai/runs/<run-id>/context.json --output .ai/runs/<run-id>/validator-plan.json`.
8. Review the validator plan, execute the selected commands in order, and record exact pass, fail, and skip results. Selection alone is not validation.
9. If a validator, hook, build, CI job, or workflow step fails, route through `axtask.failure-recovery.v1` before further retries.
10. Review diff and Git state.
11. Commit and push through a feature branch and PR.
12. Produce the operator report and compressed final handoff.

## Stop conditions

Stop only for foreign dirty work that cannot be isolated, a missing permission required for an explicit write, a destructive/live mutation boundary, or an exact repository contradiction that cannot be resolved safely.

## Proof ceiling

Repository and CI proof never imply live Render, Neon, deployment, or user acceptance.
