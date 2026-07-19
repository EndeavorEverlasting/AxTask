authorityRef: axtask.agent-authority.v1

# Skill: PR closeout

id: axtask.skill.pr-closeout.v1

Purpose: converge an open PR onto current `main`, repair review findings, and close it with honest proof.

Required evidence: base/head SHAs, ahead/behind count, changed paths, review threads, current checks, collision ownership, final diff, and merge SHA.

Decision rule: rebuild rather than casually merge when a branch is stale and touches shared contracts.

Avoid: stale green-check confidence, unresolved correctness findings, unrelated cleanup, and live-system claims.
