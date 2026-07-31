# Skill Tree Cross-Domain Edge Preservation

**Date:** 2026-07-29  
**Source:** useful Skill Tree-only delta isolated from superseded PR #104

## Delivered

- preserves `additionalEdges` whose endpoints span avatar and offline Skill Tree domains after the two domain subgraphs are laid out separately;
- deduplicates reconstructed cross-domain edges against edges already emitted inside either domain;
- adds a focused graph-builder regression test for an avatar-to-offline generator edge.

## Preservation boundary

This branch deliberately excludes the backup runner, package script, capability registration, and combined release record from PR #104. It is the clean current-main foundation for the broader interactive Skill Tree sprint.

## Validation

The owning focused command is:

`npx vitest run client/src/lib/skill-tree-graph-build.test.ts`

Repository CI must pass on the exact branch head before this preservation floor is eligible to merge.

## Rollout

No deployment, migration, Render change, Neon change, or production action is required. The broader interactive Skill Tree application surface remains unimplemented in this preservation commit.

## Rollback

Remove the cross-domain reconstruction block, its regression test, and this release record.

## Proof ceiling

The focused contract can prove graph-builder behavior for covered fixtures. It does not prove the complete interactive Skill Tree surface, persistence, browser behavior, production rendering, or user acceptance.
