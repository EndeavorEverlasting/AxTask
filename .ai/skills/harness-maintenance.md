authorityRef: axtask.agent-authority.v1

# Skill: harness maintenance

id: axtask.skill.harness-maintenance.v1

Purpose: keep the repo-agent control plane coherent and low-noise.

When changing a harness component:
- update `.ai/harness.json` when component inventory changes;
- update the appropriate registry or map;
- preserve the canonical authority reference;
- add negative tests for malformed contracts;
- keep runtime evidence in ignored paths;
- keep hooks opt-in;
- update `docs/AI_HARNESS.md` and a release note for structural changes;
- run authority, base harness, infrastructure completeness, and collected Vitest contracts;
- route validator, hook, build, CI, or workflow failures through `axtask.skill.failure-recovery.v1` and `axtask.failure-recovery.v1` rather than retrying ad hoc.

Do not duplicate repository law inside skills. Link to the authority manifest.
