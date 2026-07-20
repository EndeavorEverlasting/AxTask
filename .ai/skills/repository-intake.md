authorityRef: axtask.agent-authority.v1

# Skill: repository intake

id: axtask.skill.repository-intake.v1

Purpose: recover current operational truth without crawling generated dependencies or narrating every file.

Inspect: Git state, repository law, codebase map, recent commits, open PRs, validators, CI, runtime seams, output policy, unresolved signals, and foreign dirt.

Select: derive the validator plan from changed paths and the chosen workflow with `scripts/ai-harness/select-validators.mjs`; review the plan before executing commands.

Produce: a run context, ranked sprint queue, one bounded implementation, validator plan, validation evidence, operator report, and compressed handoff.

Avoid: stale plans as authority, treating validator selection as execution, huge raw logs, sensitive values, vendored dependency scans, and speculative refactors.
