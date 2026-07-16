# AI harness authority contract

Date: 2026-07-15

## Summary

Adds the first machine-readable AxTask AI harness contract. The new authority manifest preserves the repository authority order established by the agent operating-law repair and prevents future skills, capabilities, triggers, and workflows from copying or redefining it.

## Included

- `.ai/authority.json` with a versioned authority identifier and ordered source list
- `.ai/README.md` with the required reference format
- `scripts/ai-harness/validate-authority.mjs`
- deterministic authority-contract tests
- an `AGENTS.md` link to the manifest and validator

## Contract

Future harness artifacts under:

```text
.ai/skills/
.ai/capabilities/
.ai/triggers/
.ai/workflows/
```

must declare:

```text
authorityRef: axtask.agent-authority.v1
```

They may define scope, inputs, validation, stop conditions, and proof ceilings. They must not copy the canonical authority headings or known stale platform statements.

## Validation

```bash
node scripts/ai-harness/validate-authority.mjs
npx vitest run tests/ai-harness/authority-contract.test.ts
npm run release:check
npm run check
npm test
npm run build
```

## Scope

This slice does not add workflow, skill, capability, or trigger behavior. It establishes the shared authority contract those later artifacts must consume.

No application routes, UI, schema, migrations, deployment configuration, startup behavior, or production state are changed.

## Rollout

The operating-law repair is already merged. This clean branch is based directly on that merged `main` floor and may merge after the authority validator and full CI pass.

## Rollback

Revert this slice only if it is replaced by another versioned authority manifest and validator. Removing the contract without a replacement would allow later harness files to duplicate or contradict repository law.

## Proof ceiling

Tests can prove manifest structure, document anchors, authority references, and rejection of copied headings. They do not prove external agent-host behavior or production behavior.
