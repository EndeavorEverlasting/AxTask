# AxTask DeepSeek GNHF night sprint artifact

Date: 2026-07-18
Status: review

## Summary

Adds a bounded Good Night Have Fun overnight sprint artifact for AxTask, compiled from the AI Harness Prompt Kit V38 night-shift rules and AxTask's current repository law.

## Delivered

- `docs/ops/gnhf/axtask-night-sprint.md`
  - one repository and one reproducible, non-colliding failure cluster;
  - finite OVERNIGHT iteration and token caps;
  - positive observable completion condition;
  - deterministic validation, local commit requirement, no-progress handling, operational-failure classification, and proof ceiling;
  - explicit exclusion of deployment, schema, authentication, live databases, scheduled resources, provider secrets, dependency churn, and open-PR-owned work.
- `docs/ops/gnhf/README.md`
  - copy-ready DeepSeek-first AgentSwitchboard launch command;
  - exact provider/model pin and bounded spawnability probe;
  - no first-run push and morning review commands.
- `scripts/ops/validate-axtask-gnhf-prompt.mjs`
  - deterministic prompt and launcher validation.
- `tests/ops/axtask-gnhf-prompt.contract.test.ts`
  - enforcement for the prompt, provider/repository failure boundary, tracked local result, and no live authority.

## Dependency

The preferred launch depends on the reviewed AgentSwitchboard DeepSeek route, which keeps OpenCode as the truthful native GNHF adapter and selects DeepSeek as the provider/model after an exact-model preflight.

## Runtime impact

None. This release record adds operator documentation and validation contracts only. It changes no AxTask application runtime, deployment, schema, authentication, environment, scheduled task, dependency, or production behavior.

## Validation

```text
node scripts/ops/validate-axtask-gnhf-prompt.mjs
npx vitest run tests/ops/axtask-gnhf-prompt.contract.test.ts
npm run check
npm run release:check
```

The repository CI also runs the broader test, build, security, performance, and deployment-contract lanes according to the existing workflow.

## Rollback

Revert the documentation, validator, test, and this release record. No data or runtime rollback is required.

## Proof ceiling

Repository validation proves the prompt contract and launch shape only. It does not prove local provider authentication, DeepSeek quota, a live GNHF run, generated worktree changes, push, review, merge, deployment, database state, or production behavior.
