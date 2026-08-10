# Log retention operator report

authorityRef: axtask.agent-authority.v1

## STATUS

- repository SHA:
- workflow: `axtask.log-retention-capacity-defense.v1`
- repository retention contract: PASS / FAIL
- live retention execution: PROVEN / UNPROVEN / BLOCKED

## REPOSITORY CONTRACT

- policy: `docs/DB_RETENTION_POLICY.md`
- runner: `scripts/db-retention.mjs`
- scheduler: `render.yaml` → `axtask-db-retention`
- schedule: `15 4 * * *` (04:15 UTC daily)
- command: `node scripts/db-retention.mjs`
- required secret presence proven: yes / no / not checked

## CAPACITY SENTINELS

| Surface | Policy window | Runner window | Status |
| --- | --- | --- | --- |
| `security_events` | | | |
| `foundry_run_logs` | | | |

## VALIDATION

- `node scripts/ai-harness/validate-authority.mjs`:
- `node scripts/ai-harness/validate-harness.mjs`:
- `node scripts/ai-harness/validate-log-retention.mjs`:
- relevant tests/build:

## LIVE RUNTIME EVIDENCE

- Render cron present/enabled:
- last successful retention timestamp:
- sanitized success marker observed: `[retention] done. rows_deleted=` yes / no
- evidence source:

## GAPS / RISKS

- repository gap:
- runtime gap:
- capacity risk:
- disabled-control risk:

## NEXT ACTION

- owner:
- dependency:
- exact command or operator action:
- expected artifact/proof:
- completion gate:

## PROOF CEILING

Repository validation does not prove live Render cron instantiation, enabled state, credentials, recent successful execution, or production storage reduction. State those separately and do not upgrade them without runtime/operator evidence.
