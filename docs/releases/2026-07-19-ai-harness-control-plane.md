# Repository AI harness control plane

Date: 2026-07-19

## Diagnosis

AxTask had strong repository law and validators, but no complete machine-readable path from fresh-agent intake through workflow selection, run boundaries, artifact policy, validation, operator reporting, and compressed handoff. PR #80 supplied the authority kernel but had diverged from current `main`.

## Change

Rebuilt PR #80 from the current repository floor and completed the bounded repo-agent harness:

- canonical authority and component manifests
- codebase map
- repository-intake and PR-closeout workflows
- run-context schema
- artifact and validator registries
- scoped intake, closeout, and maintenance skills
- read-only repository inspector
- opt-in local hooks
- English operator report and final handoff templates
- fail-closed validators and collected contract tests
- ignored runtime and generated-output paths

Prompts remain registered artifacts rather than the harness itself.

## Scope

Changed only repo-agent harness files, tests, documentation, `AGENTS.md`, and ignored-output policy.

Not changed:

- application routes or UI
- deployment configuration or startup behavior
- schema or migrations
- authentication
- dependencies or lockfiles
- live Render or Neon state

## Validation

```bash
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
npx vitest run server/ai-harness/authority-contract.test.ts server/ai-harness/harness-contract.test.ts
npm run release:check
npm run check
npm test
npm run build
```

## Rollout

Merge after the rebuilt head is green against current `main`. Future harness artifacts must register themselves, reference `axtask.agent-authority.v1`, and pass both validators.

## Rollback

Revert this PR only if another versioned harness replaces its authority, component, workflow, run-context, artifact, validation, reporting, and handoff contracts.

## Proof ceiling

Repository and CI proof only. This change does not prove external agent behavior or any live deployment/database state.
