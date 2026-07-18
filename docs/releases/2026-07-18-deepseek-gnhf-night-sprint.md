# AxTask DeepSeek GNHF night harness

Date: 2026-07-18
Status: review

## Summary

Adds a bounded Good Night Have Fun harness for AxTask, compiled from the AI Harness Prompt Kit V38 night-shift rules and AxTask's current repository law.

The runtime objective, PowerShell launcher, and one-click CMD entrypoint are separate tracked artifacts. A regular AI prompt is not accepted as the GNHF launcher.

## Delivered

- `docs/ops/gnhf/axtask-night-sprint.md`
  - one repository and one reproducible, non-colliding failure cluster;
  - finite OVERNIGHT iteration and token caps;
  - positive observable completion condition;
  - deterministic validation, local commit requirement, no-progress handling, operational-failure classification, and proof ceiling;
  - explicit exclusion of deployment, schema, authentication, live databases, scheduled resources, provider secrets, dependency churn, and open-PR-owned work.
- `scripts/ops/Start-AxTaskGnhfNight.ps1`
  - derives and enters the AxTask repository before Git, installation, provider, or GNHF logic;
  - requires a clean non-main branch;
  - calls the reviewed AgentSwitchboard provider-routed launcher;
  - applies exact model, iteration, token, probe, and stop bounds;
  - does not push.
- `Run-AxTaskGnhfNight.cmd`
  - enters the repository with `%~dp0` before invoking the PowerShell launcher;
  - provides a one-click Windows entrypoint.
- `docs/ops/gnhf/README.md`
  - separates the three execution surfaces;
  - documents the exact AgentSwitchboard/OpenCode/DeepSeek route;
  - records provider evidence and morning review procedures.
- `scripts/ops/validate-axtask-gnhf-prompt.mjs`
  - enforces objective/launcher separation, directory-first ordering, reviewed provider routing, bounded controls, no machine-specific username, and no first-run push.
- `tests/ops/axtask-gnhf-prompt.contract.test.ts`
  - executes the validator under the normal Node Vitest project.
- `vitest.config.ts`
  - discovers `tests/ops/**/*.test.{ts,tsx}` so the harness contract runs in normal CI.

## Dependency

The preferred launch depends on AgentSwitchboard PR #25, which provides Windows-safe command-shim dispatch, a GNHF 0.1.42 model-capability floor, exact-model provider preflight, fail-fast evidence, and commit-based delivery proof.

## Runtime impact

No AxTask application runtime, deployment, schema, authentication, environment, scheduled task, dependency, database, or production behavior changes.

The operator surface gains local PowerShell and CMD launchers. They may repair the local AgentSwitchboard/GNHF control plane only when the operator invokes the one-click launcher or passes `-RepairControlPlane`.

## Validation

```text
node scripts/ops/validate-axtask-gnhf-prompt.mjs
npx vitest run tests/ops/axtask-gnhf-prompt.contract.test.ts
npm run check
npm run release:check
```

The repository CI also runs the broader test, build, security, performance, and deployment-contract lanes according to the existing workflow.

## Rollback

Revert the runtime objective, local launchers, runbook, validator, test, Vitest discovery change, and this release record. No data or production rollback is required.

## Proof ceiling

Repository validation proves the tracked harness, command shape, test discovery, and safety contracts. It does not prove local provider availability, quota, network, a live GNHF run, generated worktree changes, push, review, merge, deployment, database state, or production behavior.
