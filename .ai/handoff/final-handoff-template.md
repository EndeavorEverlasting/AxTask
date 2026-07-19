authorityRef: axtask.agent-authority.v1

# Final handoff

## Identity

Repository, branch, HEAD, PR, sprint, and owned lane.

## Durable facts

Only facts that prevent rework: changed files, contracts, decisions, blockers, and proof ceiling.

## Validation

Passing commands, failing commands, and exact skipped checks.

## Remaining work

Ordered dependencies and one next command.

## Compression rules

- Do not include private reasoning.
- Do not paste raw logs or sensitive values.
- Do not repeat the full conversation.
- Do not generate a next-agent prompt.
- Prefer exact paths, SHAs, PR numbers, and validator names.
