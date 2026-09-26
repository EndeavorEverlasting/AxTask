# Shared Task Tracker → AxTask ingestion plan

## Summary

- Reconciled the validated provider-owned Shared Task Tracker top-entry design with AxTask's existing Google Sheets subsystem.
- Recorded that physical top-row insertion is not an acceptable tracker entry mechanism; top-entry is staging → append with immutable source TaskID.
- Quarantined the current AxTask bidirectional Google Sheets sync for this tracker because it clears/re-writes `A2:L`, uses row-derived temporary IDs, and does not preserve the tracker's source-TaskID ownership contract.
- Extended the canonical assistant-action execution/reference plans with S0 + G1–G5: bound Apps Script deployment, read-only source adapter/dry-run, shared-domain-service ingestion, review/apply UX, controlled live ingestion, and AxTask-canonical cutover.
- Added AXQ-011 (provider deployment gate) and AXQ-012 (ingestion convergence).
- Preserved direct dictation as the existing Assistant Action Contract path; Sheets is a continuity/migration producer, not the destination architecture.

## Safety / privacy

- No private spreadsheet ID, credentials, or task contents are stored in Git.
- No production or provider mutation is performed by this planning change.
- Existing unrelated PRs #155 and #156 remain untouched.
- No Phase 1 application behavior is implemented here.

## Proof ceiling

Planning/repository alignment only. The bound Apps Script deployment requires an Apps Script-capable provider surface. Live Google Sheets → AxTask ingestion waits for AXQ-009 Phase 1/A6 plus AXQ-011 provider proof.

## Review reconciliation

- CodeAnt concurrency finding: accepted. The plan now requires A3 to provide an atomic idempotency claim plus replayable canonical-ID receipt; G2 derives a stable A3 action/idempotency key from the tracker source identity and does not implement check-then-create dedupe.
- CodeAnt server-bypass finding: accepted. G3 now retires `POST /api/google-sheets/sync` at the server boundary for all callers before live tracker ingestion; hiding UI alone is explicitly insufficient.
- CodeAnt documentation-state findings: accepted. The architecture and setup guide now distinguish the endpoint's **current reachable/unsafe** state from the future enforced quarantine transition.
