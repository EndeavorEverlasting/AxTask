authorityRef: axtask.agent-authority.v1

# Operator report

## REPO EVIDENCE

Repository, branch, HEAD, worktrees, dirty state, open PRs, center of gravity, and exact important paths.

## WORKFLOW

Workflow ID, owned scope, forbidden scope, selected sprint, and proof ceiling.

## WORK COMMITTED

Summary, files changed, artifacts, commit SHA, push state, and PR state.

## VALIDATION

Commands, results, exact skips, and highest proof reached.

## RUNTIME PROOF

When runtime or deployment behavior was exercised, record the sanitized `.ai/runs/<run-id>/runtime-proof.json` and sibling `.ai/runs/<run-id>/local-cert-report.md` references, validator result, attained proof level, and proof ceiling. State `not produced` when the sprint did not execute a runtime workflow. Never promote local-runtime proof to live deployment or operator acceptance. If a runtime workflow ran but its proof artifact is missing or invalid, report the runtime claim as incomplete rather than substituting logs or prose.

## GAPS / RISKS

Unknowns, blockers, collision risks, live-system boundaries, and deferred work.

## FINAL GIT STATE

`git status --short`, branch, HEAD, and remote state.

## NEXT COMMAND

One exact command.
