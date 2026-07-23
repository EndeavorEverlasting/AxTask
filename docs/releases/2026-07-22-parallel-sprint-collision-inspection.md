# Parallel sprint collision inspection capability

## Summary

Implemented the repository-owned executable capability `pr-collision-inspection` (`scripts/ai-harness/inspect-pr-collisions.mjs`), collision ledger schema (`.ai/collision-ledger.schema.json`), parallel sprint intake workflow (`.ai/workflows/parallel-sprint-intake.md`), trigger (`parallel-sprints-requested`), artifact (`collision-ledger`), and contract test suite (`server/ai-harness/collision-inspection-contract.test.ts`).

## Diagnosis

AxTask contains multiple planned reliability sprints (P01 Backup Center, P02 Skill Tree repair, P03 Backup/Restore certification) and a crowded open PR floor. Prior to this sprint, collision inspection was listed as a planned capability without executable repository tooling. To safely launch parallel work, agents required a deterministic capability to inspect open PRs and planned sprint path ownership, calculate file overlaps, and emit a machine-readable collision ledger before repository mutation begins.

## Changes

- created `scripts/ai-harness/inspect-pr-collisions.mjs` supporting `--base`, `--output`, `--planned`, `--open-prs-json`, `--fail-on-collision`, and `--json`;
- created `.ai/collision-ledger.schema.json` defining the structured ledger format;
- created `.ai/workflows/parallel-sprint-intake.md` detailing the intake and collision inspection steps;
- updated `.ai/capability-registry.json` moving `pr-collision-inspection` from `planned` to `available`;
- updated `.ai/workflow-registry.json`, `.ai/trigger-registry.json`, `.ai/artifact-registry.json`, and `.ai/harness.json`;
- updated `.ai/validator-registry.json` with `collision-inspection` validator and added tests to `harness-tests`;
- added `server/ai-harness/collision-inspection-contract.test.ts` covering zero collisions, exact overlap, high-risk surfaces, degraded mode, malformed input, sanitization, and deterministic output;
- generated the initial Gate G0 collision ledger under `.ai/runs/latest/collision-ledger.json`.

## Scope

AI harness coordination only. No product code, database migrations, authentication, dependencies, or live deployment configuration changed.

## Validation

```bash
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
node scripts/ai-harness/inspect-pr-collisions.mjs --output .ai/runs/latest/collision-ledger.json
npx vitest run server/ai-harness/authority-contract.test.ts server/ai-harness/harness-contract.test.ts server/ai-harness/deployment-certification-contract.test.ts server/ai-harness/validator-selection-contract.test.ts server/ai-harness/harness-infrastructure-contract.test.ts server/ai-harness/collision-inspection-contract.test.ts
npm run release:check
npm run check
npm test
npm run build
git diff --check
```

## Rollout

Merge the parallel sprint collision inspection capability into `main`. Subsequent parallel chats (P01, P02, P03) can invoke `node scripts/ai-harness/inspect-pr-collisions.mjs` during intake to confirm path isolation.

## Rollback

Revert the collision-inspection commit. This removes the `pr-collision-inspection` capability and workflow while leaving product code unaffected.

## Proof ceiling

Harness contract, schema, unit test, build, and static evidence only. No live GitHub mutation, browser, staging, or production runtime claim.
