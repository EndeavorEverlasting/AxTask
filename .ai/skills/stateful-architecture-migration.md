authorityRef: axtask.agent-authority.v1

# Stateful Architecture Migration Skill

id: axtask.skill.stateful-architecture-migration.v1

## Use when

A task asks to make AxTask serverless/stateless, remove a persistent server, change persistence or sessions, move cron/background work, introduce functions/queues/KV/object storage, or otherwise alter a stateful runtime boundary.

## Required inputs

- `.ai/stateful-surface-ledger.json`
- `.ai/stateful-execution-contract.json`
- `.ai/architecture/surfaces/*.json`
- current repo/branch/PR/collision evidence
- required proof level and proof ceiling

## Procedure

1. Validate the canonical ledger and task artifacts.
2. Run `node scripts/ai-harness/next-stateful-task.mjs` and accept exactly the one routed surface/gap as the current reasoning boundary.
3. Inspect only the exact files emitted under `OWNED PATHS` and answer only the emitted question.
4. Within three repository/tool operations after routing, perform a productive action: inspect a routed file, update the current surface artifact, run its validator, or record an exact blocker. Do not loop on statements that the ledger will be written.
5. Update only the current gap in `.ai/architecture/surfaces/<surface-id>.json`. Keep the canonical ledger unchanged while the task is merely `EVIDENCE_REQUIRED`.
6. Set the current gap to `resolved` only with concrete source, finding, and proof level; then run the exact `--require=<gap-id>` validator emitted by the router.
7. Run the router again. Never manually jump to a later surface while an earlier open gap remains.
8. When the surface reaches `READY_FOR_DECISION`, evaluate only that surface against the canonical ledger. KEEP is valid and remains the default until evidence justifies another disposition.
9. Set exactly one non-`keep` surface to `decisionStatus=approved` only when the canonical migration guardrails are satisfied. `approved` is active authorization, not historical status.
10. If approved for migration, execute one seam only. After required proof is complete, set `decisionStatus=completed` before another non-`keep` seam may be approved.

## Guardrails

- Stateful does not mean bad.
- KEEP is a successful outcome when it is the simplest correct architecture.
- Complete the next unresolved ledger fact, not the whole ledger.
- The router returns at most one task; do not broaden its scope.
- `EVIDENCE_REQUIRED` never authorizes product/runtime mutation.
- `approved` means active authorization; `completed` means historical evidence and does not authorize new mutation.
- At most one non-`keep` surface may be `approved` at a time.
- Do not choose or introduce a serverless provider before requirements are proven.
- Do not translate application/domain behavior into prompt text.
- Do not change auth/session, data consistency, retry/idempotency, or API contracts implicitly.
- Do not infer usage from package dependencies alone.
- Do not couple a DB incident to a conclusion that relational persistence is unnecessary.
- Do not claim launcher/browser, behavior-observed, or live-runtime proof from static tests or builds.
- Preserve unknown dirty work and parallel ownership; shared collision paths have one writer.
- If an out-of-scope tracked path is only CRLF/LF noise, use `node scripts/ai-harness/restore-eol-noise.mjs <path>`; the helper refuses semantic changes.

## Outputs

- one evidence-backed per-surface artifact update;
- exact current-gap validator result;
- one bounded canonical ledger decision only after evidence gaps are resolved;
- `.ai/runs/<run-id>/stateful-task-report.md`;
- commit/PR evidence and the router's next executable action.

## Proof rules

Contract/harness validation proves the task loop and migration rules are enforced. Static tests prove code contracts. Build proves buildability. Launcher/browser proof requires the real launcher/browser surface. Behavior observed requires actual observation. Live runtime proof requires the protected live environment. Never promote proof.
