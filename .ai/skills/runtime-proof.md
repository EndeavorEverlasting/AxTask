authorityRef: axtask.agent-authority.v1

# Skill: runtime proof

id: axtask.skill.runtime-proof.v1

Purpose: keep deployment-related claims structurally honest.

When a deployment or runtime claim is made:
- require a runtime-proof artifact matching `.ai/runtime-proof.schema.json`;
- check that `attainedProofLevel` does not exceed `proofCeiling`;
- check that `environmentClass` does not allow forbidden proof escalation;
- reject local proof claiming live-runtime, deployment-completion, or operator-acceptance;
- reject any live claim without `deploymentId`, `deploymentTimestamp`, and observed endpoints;
- keep raw logs, credentials, and heap snapshots out of tracked files;
- point to the canonical runtime-proof schema rather than copying escalation rules into prose.

Do not invent deployment IDs, deployment timestamps, or observed endpoints. A missing runtime-proof artifact is a NO-GO condition for any deployment-related claim.
