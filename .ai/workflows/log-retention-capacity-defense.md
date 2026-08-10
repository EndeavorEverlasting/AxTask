# Log retention capacity defense

authorityRef: axtask.agent-authority.v1
workflowId: axtask.log-retention-capacity-defense.v1

## Use when

- append-only or audit/log tables are growing unexpectedly;
- `security_events`, `foundry_run_logs`, retention windows, the retention runner, or the Render cron definition changes;
- a production recovery or deployment decision depends on bounded database growth;
- an agent is tempted to infer that retention is active merely because a policy or script exists.

## Inputs

- current repository SHA and clean/isolated worktree state;
- `.ai/log-retention-contract.json`;
- canonical policy, runner, scheduler, and scheduled-resource-control files referenced by that contract;
- optional live Render retention evidence supplied by an authorized operator.

## Steps

1. Preserve unrelated dirty work; use an isolated worktree when ownership is unclear.
2. Run `node scripts/ai-harness/validate-authority.mjs` and `node scripts/ai-harness/validate-harness.mjs`.
3. Run `node scripts/ai-harness/validate-log-retention.mjs`. Treat any mismatch between policy, runner, scheduler, sentinel windows, or harness registration as a blocking repository defect.
4. Produce `.ai/runs/<run-id>/log-retention-proof.json` with `node scripts/ai-harness/validate-log-retention.mjs --json > <path>`; keep this generated proof untracked.
5. If live runtime proof is required, obtain operator-authorized Render evidence showing the `axtask-db-retention` cron is present/enabled and a recent successful run contains `[retention] done. rows_deleted=`. Repository validation alone is not live proof.
6. If the cron is intentionally disabled during an incident, record the exact blocker, owner, expiry/reevaluation point, and bounded manual mitigation. Do not silently accept indefinite disablement.
7. Render `.ai/reports/log-retention-report-template.md` into `.ai/runs/<run-id>/log-retention-report.md` and hand off the next executable gate.

## Failure handling

- Policy/runner mismatch: stop; repair both in the same owning sprint.
- Scheduler missing or command/cadence drifted: stop; open a bounded deployment/runtime sprint rather than claiming retention is active.
- Live evidence missing: report repository proof only and name the operator/runtime evidence required.
- Retention command failure: preserve the exact failing table and error; do not substitute destructive reclaim for routine retention without the recovery runbook prerequisites.

## Outputs

- `.ai/runs/<run-id>/log-retention-proof.json` — untracked, sanitized repository contract proof.
- `.ai/runs/<run-id>/log-retention-report.md` — untracked operator summary.
- tracked harness repairs when repository contracts are incomplete.

## Proof ceiling

This workflow can prove repository policy, runner, scheduler configuration, harness routing, and validator coverage. It cannot prove that Render has instantiated/enabled the cron, that production credentials are configured, that a recent retention run succeeded, or that production storage actually decreased without live operator/runtime evidence.
