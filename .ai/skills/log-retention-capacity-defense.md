# Skill: log retention capacity defense

authorityRef: axtask.agent-authority.v1
skillId: axtask.skill.log-retention-capacity-defense.v1

## Trigger conditions

Use this skill when append-only/log growth is discussed, when retention/scheduler files change, when a deployment or recovery depends on bounded database growth, or when live retention status is uncertain.

## Required inputs

- current repository SHA;
- `.ai/log-retention-contract.json`;
- `docs/DB_RETENTION_POLICY.md`;
- `scripts/db-retention.mjs`;
- `render.yaml`;
- `docs/SCHEDULED_RESOURCE_CONTROLS.md`;
- live Render retention evidence only when the operator/runtime proof level is requested.

## Procedure

1. Run `node scripts/ai-harness/validate-log-retention.mjs` before changing or certifying retention-related harness state.
2. Keep critical sentinel windows synchronized between the canonical retention policy and runner.
3. Require the registered `axtask-db-retention` cron service to retain its bounded schedule and `node scripts/db-retention.mjs` command in repository configuration.
4. Keep retention validation in the pre-push harness. Do not bypass it because ordinary tests pass.
5. Generate sanitized proof with `node scripts/ai-harness/validate-log-retention.mjs --json`; never track raw Render logs, database dumps, credentials, or full production query output.
6. Distinguish repository wiring from live operation. A green validator is not evidence that Render instantiated or recently executed the cron.
7. If live execution is unproven, name the exact runtime evidence needed instead of upgrading the proof level.

## Expected outputs

- PASS/FAIL from `node scripts/ai-harness/validate-log-retention.mjs`;
- `.ai/runs/<run-id>/log-retention-proof.json` when a durable run artifact is useful;
- `.ai/runs/<run-id>/log-retention-report.md` for operator-facing state;
- a bounded tracked repair when any repository retention contract is incomplete.

## Safety

Routine retention is DELETE-only and is distinct from destructive/locking reclaim operations. Do not use this skill to authorize `TRUNCATE`, `VACUUM FULL`, production cleanup, or other recovery mutations; those remain governed by the database recovery runbook and explicit operator authorization.
