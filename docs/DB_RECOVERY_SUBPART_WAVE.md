# Database Recovery Sub-Part Execution Wave

authorityRef: axtask.agent-authority.v1

This document accelerates the production database recovery without weakening `docs/DB_RECOVERY_RUNBOOK.md`. It exists so separate agents/operators can execute independent recovery gates in parallel instead of serializing all work behind one chat.

## Launch order

### Wave A — launch immediately

Run these as separate sub-parts. They do not own each other's files or runtime artifacts.

1. **R1 operator evidence** — production SELECT-only forensics. This remains the decision gate for the removable event class.
2. **R3 raw backup + disposable restore** — may proceed in parallel with R1 because it preserves data and does not depend on the account-evidence export. Use source-read-only backup mode.
3. **R7 local production certification** — may proceed in parallel because it uses disposable local PostgreSQL and proves only local runtime behavior.

### Wave B — launch immediately after R1 is accepted

4. **R1.5 account evidence preservation** — protected production export plus two independently verified copies.
5. **R2 containment assessment** — use R1 trigger evidence and the containment dry run. If containment is already origin-active, record proof and do not mutate it. If mutation is required, wait for R3 restore proof before executing containment.

R1.5 and R2 assessment are parallel lanes. R2 mutation, if needed, is not.

### Wave C — convergence mutation gate

6. **R4 targeted logical cleanup** — only when R1.5 is complete, R3 backup/restore proof is complete, and R2 containment is origin-active. This lane owns the bounded `api_request` cleanup only.

### Wave D — capacity convergence

7. **R5 physical reclaim decision** — perform only if the post-R4 audit shows physical shrink is still required. `VACUUM FULL` remains separately authorized.
8. **R6 capacity policy** — run after logical/physical convergence and record the deliberate operator budget decision.

### Wave E — deployment

9. **R8 Render resume/deploy** — only after R0-R7 are recorded and the operator explicitly authorizes one live attempt.
10. **R9 observation** — verify telemetry suppression, meaningful security events, DB-size stability, and retention behavior.

## Sub-Part Agent A — R3 backup/restore

**Owner:** protected operator runtime / backup sub-part agent.

**May start:** immediately while R1 is still being gathered.

**Production safety:** do not write to the source DB merely to record the backup. The recovery path uses `--no-ledger`.

```bash
npm run db:backup:preflight -- --no-ledger
RESTORE_DATABASE_URL='postgres://...disposable-loopback...' npm run db:restore:test
```

`db:backup:preflight` already creates one dump, writes its manifest, and verifies the dump SHA-256. Do **not** run `npm run db:backup` again after it; that would create an unnecessary second dump.

**Completion proof:** protected dump + manifest, manifest `sourceLedgerMode: "skipped"`, matching SHA-256, and `restoreTestedAt` populated after successful disposable restore.

## Sub-Part Agent B — R7 local certification

**Owner:** repository/local-runtime sub-part agent.

**May start:** immediately; no production credential is required.

```bash
AXTASK_LOCAL_CERT=1 node scripts/deploy/run-local-cert.mjs
npm run test:deploy
npm run build
```

**Completion proof:** local production certificate/runtime proof showing production launcher, `/health`, `/ready`, client shell, and fail-closed recovery defaults. This is local-runtime proof only.

## Sub-Part Agent C — R1.5 evidence preservation

**Owner:** protected operator runtime / evidence sub-part agent.

**May start:** after R1 confirms the live scope and removable event class.

Use the exact command and copy-verification procedure in `docs/DB_RECOVERY_RUNBOOK.md` and `docs/ACCOUNT_EVIDENCE_PRESERVATION.md`.

**Completion proof:** `EXPORT_INCOMPLETE` absent without manual removal, manifest and per-file hashes verified, two independently controlled verified copies, plus attachment-object manifest when attachment bytes are in scope.

## Sub-Part Agent D — R2 containment

**Owner:** production containment sub-part agent.

**May start:** assessment after R1.

```bash
node scripts/db-contain-api-request.mjs --json
```

If R1/dry-run proves the trigger is already origin-active, record that proof and stop without mutation. If containment mutation is required, it remains blocked until Sub-Part A has produced R3 restore proof, then use only the authorized containment command from the runbook.

## Convergence owner

The convergence owner does not rerun completed sub-parts. It verifies durable proof from A-D, then advances R4. R4 may not start until all three conditions are true:

- R1.5 preservation complete;
- R3 raw backup + disposable restore complete;
- R2 containment origin-active.

After R4, re-run the forensic audit, decide R5 only from post-cleanup physical-size evidence, run R6 capacity policy, confirm the already-completed R7 local certification is still applicable to the exact deployment SHA, and only then present R8 for operator authorization.

## Collision boundaries

- Sub-Part A owns backup/restore artifacts outside Git; never commit dumps or manifests containing machine-local paths.
- Sub-Part B owns disposable local runtime proof; no production mutation.
- Sub-Part C owns account evidence outside Git; never commit exports, credentials, account identifiers, or protected paths.
- Sub-Part D owns containment assessment and, only after R3, the one-off containment action.
- R4/R5 are single-owner production mutation lanes. Never run them in parallel with each other or with another production mutation.
- Render remains suspended through R7.
