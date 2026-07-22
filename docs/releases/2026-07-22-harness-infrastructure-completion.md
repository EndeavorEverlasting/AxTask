# Harness infrastructure completion

## Summary

Completed the remaining AxTask repo-local AI harness infrastructure required for a fresh agent to inspect the repository, choose a workflow, run validators, recover from failures, produce registered artifacts, and hand off cleanly.

## Diagnosis

The existing control plane already provided repository law, authority, workflows, run context, validator selection, hooks, reports, and handoff compression. Three operational gaps remained:

1. the codebase map did not enumerate configuration files and the complete build, test, deployment-contract, and production-start command surface;
2. the artifact registry omitted runtime proof and did not consistently define generation procedures or naming conventions;
3. validator and workflow failures had no canonical recovery workflow, scoped skill, trigger, or English failure report.

## Changes

- enriched `.ai/codebase-map.json` with configurations, commands, deployment model, and known traps;
- completed `.ai/artifact-registry.json` with runtime proof, failure reports, producers, generation instructions, naming conventions, templates, and validators;
- added `axtask.failure-recovery.v1`, `axtask.skill.failure-recovery.v1`, and `validator-or-workflow-failed`;
- added `.ai/reports/failure-report-template.md`;
- extended the existing opt-in `.githooks/pre-push` security guard with harness validators and focused contracts;
- added `scripts/ai-harness/validate-harness-infrastructure.mjs` to prove map, artifact, failure-recovery, hook, report, and dynamic skill completeness;
- added `server/ai-harness/harness-infrastructure-contract.test.ts`;
- updated harness documentation and validator selection.

## Scope

Harness infrastructure only. No changes to `AGENTS.md`, product code, schema, migrations, deployment configuration, authentication, dependencies, or live services.

## Validation

```bash
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
npx vitest run server/ai-harness/authority-contract.test.ts server/ai-harness/harness-contract.test.ts server/ai-harness/deployment-certification-contract.test.ts server/ai-harness/validator-selection-contract.test.ts server/ai-harness/harness-infrastructure-contract.test.ts
npm run release:check
npm run check
npm test
npm run build
git diff --check
```

## Rollout

Merge the harness files as one coherent change. Existing hook installation remains opt-in. Fresh agents should start at `.ai/README.md`, create a run context, generate a validator plan, and route failures through the registered recovery workflow.

## Rollback

Revert the harness-infrastructure commit. This removes the failure-recovery route and richer completeness requirements while leaving product behavior unchanged.

## Proof ceiling

Repository contract, harness, static-test, build, and CI proof only. No launcher, local runtime, staging, live deployment, or operator-acceptance claim.
