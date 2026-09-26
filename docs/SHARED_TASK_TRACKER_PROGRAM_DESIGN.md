# Shared Task Tracker — Program Design (call-stack prototypes)

**Status:** DESIGNED + G1 dry-run seam VALIDATED (repository unit tests)
**Owner:** AXQ-012 design prototype lane (`feat/shared-task-tracker-g1-dryrun-prototype`)
**Authority:** Phase 3 in [ASSISTANT_ACTION_EXECUTION_PLAN.md](./ASSISTANT_ACTION_EXECUTION_PLAN.md); operator path in [SHARED_TASK_TRACKER_OPERATOR_GUIDE.md](./SHARED_TASK_TRACKER_OPERATOR_GUIDE.md)
**Proof ceiling:** synthetic dry-run dispositions only. Does **not** prove Apps Script S0, live Google read, A1/A3 apply, or cutover.

## 1. Program recovery (not the file tree)

| Layer | Role in this program |
| --- | --- |
| **Governance** | Feature-branch + PR; no private spreadsheet IDs/task contents in Git; fail closed without TaskID; never point legacy `/api/google-sheets/sync` at the operator tracker |
| **Harness** | `.ai/WORK_QUEUE.md` AXQ-011 / AXQ-012; docs-contract tests; Phase 3 plan lanes S0, G1–G5 |
| **Program design** | This document + `shared/tracker-source-dryrun.ts` seams |
| **Implementation** | Full G1 route wiring, G2–G5, S0 live install — successor work |

### User outcomes

1. Operator enters tasks via Task Board Quick Entry after S0 (not manual planner row hunting).
2. AxTask later ingests active-region tracker rows by immutable source `TaskID` with review/apply, without destroying the sheet.
3. After cutover, AxTask is operational task authority; sheet is optional producer/projection.

### Invariants (accepted)

- Source identity = `provider + private binding + TaskID` (mutable text is payload only).
- Active region = spreadsheet rows 2–24996; legacy starts at **24997** (excluded by default).
- Formula-owned Priority/Score are projections, not create-task authority.
- Imports are one-way creates in the first slice; sheet edits do not silently overwrite AxTask.
- Blank Quick Entry Date convenience remains **UNPROVEN** until S0 date-only proof/repair.
- Deployment model stays current AxTask Render + Neon; Sheets remains an external provider. No K8s/tier change is decision-relevant for this program.

### Actors

| Actor | Owns |
| --- | --- |
| Operator | S0 Apps Script install; Task Board entry; review selections at G3/G4 |
| Bound Apps Script (Tracker V2) | Staging → append into `Daily Planner 2026`; TaskID mint |
| AxTask G1 adapter | Header-aware parse + dry-run dispositions |
| A3 executor (future) | Atomic idempotency / receipts for apply |
| A1 task-domain (future) | Full create workflow |

## 2. Domain vocabulary

| Term | Meaning |
| --- | --- |
| **Source TaskID** | Immutable tracker identity (column T / header `TaskID`) |
| **Binding** | Private Google spreadsheet authorization identity (never published) |
| **Active region / legacy region** | Row ranges relative to preserved boundary 24997 |
| **Dry-run disposition** | `create` \| `already_imported` \| `invalid` \| `legacy_excluded` \| `needs_review` |
| **Import receipt** | Durable mapping source identity → AxTask task id (G2/A3 owner) |
| **Formula-owned field** | Priority, Score — ignored as authority inputs |
| **Staging strip** | Task Board A4:J4 Quick Entry (provider) |

## 3. Module / interface map

```text
[Provider] Task Board / Daily Planner / Scripts!B2
        │ S0 (OPERATOR)
        ▼
[AxTask] Google transport adapter (read-only at G1)     ← existing google-sheets-api (quarantined for sync)
        │
        ▼
[shared] dryRunTrackerRows()                            ← PROTOTYPED HERE
        │  ports: TrackerImportReceiptPort
        ▼
[future G2] map create → A3 create_task (identity key)
        │
        ▼
[future A1] shared task-domain create
        │
        ▼
[future G3] review/apply UI + retire POST /sync (410)
```

| Module | Responsibility | Owned state | Public interface | Side effects |
| --- | --- | --- | --- | --- |
| `shared/tracker-source-dryrun.ts` | Header contract + dispositions | none (pure) | `dryRunTrackerRows`, `buildTrackerSourceIdentityKey`, `createMemoryReceiptPort` | none |
| `TrackerImportReceiptPort` | Lookup prior imports | external | `hasImportedSourceIdentity` | read-only |
| Legacy `GoogleSheetsAPI.syncTasks` | **Forbidden** for this tracker | sheet wipe risk | existing routes | destructive — retire at G3 |
| A1 / A3 | Create + idempotency | tasks + action receipts | not yet mainline | mutate AxTask |

## 4. Alternatives compared (then retired)

| Candidate | Verdict |
| --- | --- |
| **A. Extend `parsePlannerRows` in `csv-utils`** | Rejected for G1 authority — drops TaskID today and mixes bulk CSV import with tracker identity |
| **B. New pure `shared/tracker-source-dryrun` + receipt port** | **Accepted** — small interface, fail-closed TaskID, testable without Google/DB |
| **C. Reuse `parseTasksFromSheets` + content fingerprints** | Rejected — invents `sheet-${index}` IDs; fingerprint ≠ TaskID; not concurrency-safe for G2 |

## 5. Success call stack (G1 dry-run — prototyped)

```text
SYNTHETIC / FUTURE: GET planner values (header + rows)
  -> dryRunTrackerRows({ provider, bindingId, rows, receipts })
  -> resolveHeaderMap (require Date, Activity, TaskID)
  -> per data row:
       classifyRegion(spreadsheetRow)
       parse TaskID / Activity / Date / optional fields
       IGNORE Priority, Score
       receipts.hasImportedSourceIdentity(identity)?
  -> TrackerDryRunReport { disposition: create, record }
  -> (G2+ not prototyped) A3 create_task apply
```

**Terminal user value for G1:** operator sees deterministic create/invalid/… counts before any mutation.
UI states: ENTRYPOINT = dry-run request; TERMINAL = disposition report (not “opened sync page”).

## 6. Failure call stacks (prototyped)

| Journey | Classification | Surface |
| --- | --- | --- |
| Missing `TaskID` header | `headerError`, `ok: false` | fail closed before rows |
| Row without TaskID | `invalid` | row retained for correction |
| Row ≥ 24997 | `legacy_excluded` | default exclude |
| Blank Date | `needs_review` | no invent-today |
| Prior receipt for same TaskID | `already_imported` | even if Activity text changed |

## 7. Executable prototypes created

| Artifact | Proof |
| --- | --- |
| `shared/tracker-source-dryrun.ts` | Pure seam |
| `shared/tracker-source-dryrun.test.ts` | Success + failure stacks |
| This design doc | Durable architecture owner |

## 8. Second-pass critique (after prototype)

- Receipt port is the right G2 seam; do not add check-then-create inside dry-run.
- Blank Date as `needs_review` matches operator UNPROVEN blank-date policy better than inventing `new Date()`.
- Do not wire HTTP routes until A6 unblocks AXQ-012 G1 claim — prototype stays library-only to avoid premature product surface.

## 9. Unresolved / successor

| Item | State | Next transition |
| --- | --- | --- |
| S0 Apps Script install | OPERATOR (AXQ-011) | Checklist install + Today projection proof |
| A1/A3/A6 | AXQ-009 | Unblocks full G1 claim + G2 |
| HTTP dry-run route + Google read | REQUIRED SUCCESSOR | After A6; keep mutation off |
| G3 sync retirement | REQUIRED SUCCESSOR | After G2 |
| G4/G5 live cutover | REQUIRED SUCCESSOR | After G3 + S0 |

## 10. Implementation seam for next build sprint

When AXQ-009 A6 is mainline, claim AXQ-012 G1 and:

1. Add a read-only dry-run route that loads planner values and calls `dryRunTrackerRows`.
2. Persist nothing except optional sanitized count receipts.
3. Keep `/api/google-sheets/sync` quarantined until G3 returns 410.
