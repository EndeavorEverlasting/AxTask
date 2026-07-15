# Agent deployment authority repair

Date: 2026-07-15

## Diagnosis

Repository agent guidance disagreed about the active deployment path, database posture, and whether high-risk configuration files could ever be edited. Current executable evidence already points to the Render deployment path, guarded production startup, deterministic SQL migrations, and Neon-oriented recovery controls.

## Change

- Added an explicit authority order to `AGENT_GUARDRAILS.md`.
- Made current repository state and executable contracts stronger than historical platform notes.
- Recorded Render as the current deployment path and Neon as the current recovery and cost posture.
- Preserved DB-free `/health` liveness and explicit `/ready` database readiness.
- Preserved deterministic SQL migrations and the prohibition on automatic production schema mutation.
- Replaced the permanent forbidden-file model with high-risk surfaces that require owned scope, tests, and rollback evidence.
- Added the canonical authority entry point to `AGENTS.md`.
- Marked `replit.md` as a historical architecture snapshot.
- Added doctrine contract tests that pin the current authority model.

## Scope

Changed:

- `AGENT_GUARDRAILS.md`
- `AGENTS.md`
- `replit.md`
- `server/docs-contracts/docs-doctrine-contract.test.ts`
- this release note

Not changed:

- application behavior
- deployment configuration
- startup scripts
- schema or migrations
- production environment
- active feature PR source

## Rollout

Merge after doctrine contracts, release checks, typecheck, full tests, and build pass. This change repairs repository operating guidance only.

## Rollback

Revert the PR. A rollback restores contradictory guidance and should be paired with a newer canonical operating-law replacement.

## Proof ceiling

Tests can prove that repository doctrine uses the intended authority order and rejects the stale production model. They cannot prove live deployment state, database health, or production behavior.
