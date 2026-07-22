authorityRef: axtask.agent-authority.v1

# Failure report

## FAILURE

Failing validator, hook, command, workflow step, or CI job; exit code; first observed time; branch; HEAD; and environment class.

## CLASSIFICATION

One primary class: code defect, test defect, environment/tooling, stale branch or collision, permission/credential boundary, external service, or destructive/live boundary.

## REPRODUCTION

Smallest exact command that reproduces the failure and the sanitized expected-versus-observed result.

## OWNERSHIP

Owned paths, foreign dirt, open-PR collisions, and the canonical owner for the failing surface.

## ATTEMPTS

Bounded attempts, what changed before each retry, and the result. Do not include raw logs or private reasoning.

## VALIDATION STATE

Last passing proof gate, failed gate, validators still required, exact skipped checks, and proof ceiling.

## REPAIR OR BLOCKER

Changed files and regression coverage when repaired, or the exact blocker and why mutation stopped.

## NEXT OWNER

One bounded owner, expected artifact, and one exact next command.
