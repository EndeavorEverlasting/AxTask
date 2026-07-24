# Skill Tree Data Wiring and Backup Certification

Date: 2026-07-23

## Diagnosis

1. `buildSkillTreeFlowLayout` in `client/src/lib/skill-tree-graph-build.ts` separated nodes into `avatar` and `offline` subgraphs when mixed domains were rendered, dropping cross-domain `additionalEdges` between avatar and offline nodes.
2. Local backup certification lacked a dedicated runner script and capability definition enforcing production-URL safety rejections and structured runtime-proof generation.

## Change

- Preserved cross-domain `additionalEdges` in `client/src/lib/skill-tree-graph-build.ts` when both avatar and offline nodes are present.
- Added comprehensive unit test in `client/src/lib/skill-tree-graph-build.test.ts` verifying cross-domain edge preservation.
- Created `scripts/db/run-local-backup-cert.mjs` providing local synthetic backup certification, safety rejection against production/Neon URLs, and structured runtime-proof generation.
- Added `"db:backup:cert"` command to `package.json`.
- Registered `backup-restore-local-certification` capability in `.ai/capability-registry.json`.

## Scope

- `client/src/lib/skill-tree-graph-build.ts`
- `client/src/lib/skill-tree-graph-build.test.ts`
- `scripts/db/run-local-backup-cert.mjs`
- `package.json`
- `.ai/capability-registry.json`
- this release note

## Validation

- `npx vitest run client/src/lib/skill-tree-graph-build.test.ts` PASSED
- `node scripts/ai-harness/validate-authority.mjs` PASSED
- `node scripts/ai-harness/validate-harness.mjs` PASSED
- `node scripts/ai-harness/inspect-pr-collisions.mjs` PASSED
- `node scripts/release-check.mjs` PASSED
