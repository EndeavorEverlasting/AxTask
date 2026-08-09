authorityRef: axtask.agent-authority.v1

# Stateful Architecture Migration Skill

id: axtask.skill.stateful-architecture-migration.v1

## Use when

A task asks to make AxTask serverless/stateless, remove a persistent server, change persistence or sessions, move cron/background work, introduce functions/queues/KV/object storage, or otherwise alter a stateful runtime boundary.

## Required inputs

- `.ai/stateful-surface-ledger.json`
- exact owned surface and migration seam
- current repo/branch/PR/collision evidence
- implementation files and current validators
- required proof level and proof ceiling

## Procedure

1. Validate the ledger before reasoning from it.
2. Locate the matching surface by ID and inspect its exact files.
3. Gather repository evidence for process affinity, connection lifetime, persistence, scheduling, filesystem use, consumers, invariants, and collision paths.
4. Keep `decisionStatus=provisional` and `disposition=keep` until evidence supports an explicit decision.
5. When evidence is sufficient, update the surface and run the stateful-architecture validator.
6. If approved for migration, execute one seam only. Do not broaden to adjacent stateful surfaces.
7. Run the owning application validators and report strongest attained proof.
8. Update the operator report, ledger evidence, commit/PR state, and exact next action.

## Guardrails

- Stateful does not mean bad.
- KEEP is a successful outcome when it is the simplest correct architecture.
- Do not choose or introduce a serverless provider before requirements are proven.
- Do not translate application/domain behavior into prompt text.
- Do not change auth/session, data consistency, retry/idempotency, or API contracts implicitly.
- Do not infer usage from package dependencies alone.
- Do not couple a DB incident to a conclusion that relational persistence is unnecessary.
- Do not claim launcher/browser, behavior-observed, or live-runtime proof from static tests or builds.
- Preserve unknown dirty work and parallel ownership; shared collision paths have one writer.

## Outputs

- evidence-backed ledger update;
- one bounded implementation seam or an evidence-backed KEEP decision;
- selected validator results;
- `.ai/runs/<run-id>/stateful-architecture-report.md`;
- commit/PR evidence and next executable action.

## Proof rules

Contract/harness validation proves the migration rules are enforced. Static tests prove code contracts. Build proves buildability. Launcher/browser proof requires the real launcher/browser surface. Behavior observed requires actual observation. Live runtime proof requires the protected live environment. Never promote proof.
