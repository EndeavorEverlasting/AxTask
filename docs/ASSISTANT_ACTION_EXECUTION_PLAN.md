# Assistant Action Execution Plan

**Status:** ACTIVE EXECUTION MAP — W0 complete; Phase 1 open for H0 ∥ A1 ∥ A2
**Date:** 2026-09-26
**Evidence floor:** `main@375bda1d9819bfeff3c9a1a396f81a72f5f1fb6d` (`0e2e333` planning floor plus CI attestation-only successor)
**Planning owner:** merged PR #157 / `docs/ASSISTANT_ACTION_REFERENCE_ARCHITECTURE.md`
**Queue index:** `.ai/WORK_QUEUE.md` → `AXQ-009` (`READY`), `AXQ-011` (`OPERATOR`), `AXQ-012` (`BLOCKED`)
**Dispatch artifact:** `Outputs/prompt-parallel-dispatch/manifest.json`

## Outcome

Turn natural-language planning, dictation, and authorized assistant input into normal AxTask actions without creating a second scheduler or a provider-specific mutation path.

The finished behavior must support:

- user types or dictates a plan;
- AxTask parses it into typed domain actions;
- review-required actions are shown before mutation;
- approved actions execute through the same canonical domain services as ordinary AxTask UI/API writes;
- canonical task/reminder IDs and structured receipts return to the caller;
- the user can then view, edit, reschedule, complete, or reopen the resulting tasks in the ordinary AxTask UI;
- external assistants remain transports, never alternate task stores.

## Current preflight

- **Repo:** `EndeavorEverlasting/AxTask`
- **Default branch:** `main`
- **Main HEAD (planning merge):** `80c2629fd6c7602d21d399a92ca6338925e5d4c5`
- **Planning PR:** #157 MERGED (squash); prior planning branch `docs/assistant-action-reference-architecture-20260913`
- **PR #157 exact head before merge:** `86c79fe8b41c9559fc7ab82b9f8f43ca6423cff8`
- **PR #156:** open and separately owns activity-history/reporting; do not modify from AXQ-009 lanes.
- **PR #155:** open calendar overflow fix; inspect collision before touching calendar UI files.
- **PR #139:** open harness infrastructure branch; harness lane must inspect it before writing shared harness surfaces.
- **Existing harness:** repository intake, PR closeout, failure recovery, parallel sprint intake, PR-collision inspection, managed agent workspaces, capability/trigger registries, validator selection.
- **Missing requested dispatch seam:** `harness/contracts/prompt-parallel-dispatch.v1.json` and `scripts/prompt_parallel_dispatch.py` are absent on the evidence floor. The manifest therefore remains bootstrap-blocked until lane H0 creates and proves those owners.
- **Next dependency-ready lanes:** H0 ∥ A1 ∥ A2 from refreshed `origin/main`.

## Authority boundary

- **AxTask task/reminder domain:** canonical operational intent and mutation authority.
- **Shared intent layer:** natural-language parsing and deterministic review/block/autorun policy.
- **Assistant/voice/MCP/plugin:** transports only.
- **External calendar:** projection/interoperability surface unless a later explicit contract promotes it.
- **Activity ledgers / PR #156:** provenance/history projection, not schedule mutation authority.

No prompt or model response may become the only implementation of validation, recurrence, date handling, dedupe, authorization, or persistence rules.

## Real user fixture: 2026-09-27 day plan

This conversation-derived fixture is the first dogfood case. It is intentionally expressed only with fields already accepted by `insertTaskSchema`.

### Normalized reviewed action packet

```json
{
  "version": "axtask.assistant-action-packet.v1",
  "scheduledDate": "2026-09-27",
  "reviewPolicy": "review",
  "actions": [
    {
      "type": "create_task",
      "payload": {
        "date": "2026-09-27",
        "activity": "Morning routine",
        "notes": "Hydrate → brush teeth → walk dogs → workout → shower → breakfast.",
        "recurrence": "none",
        "status": "pending",
        "visibility": "private",
        "communityShowNotes": false
      }
    },
    {
      "type": "create_task",
      "payload": {
        "date": "2026-09-27",
        "activity": "DB Smith — get back to Donald",
        "notes": "Bridge the communication gap: summarize the completed DB Smith work and establish the next interaction.",
        "recurrence": "none",
        "status": "pending",
        "visibility": "private",
        "communityShowNotes": false
      }
    },
    {
      "type": "create_task",
      "payload": {
        "date": "2026-09-27",
        "activity": "Complete taxes",
        "notes": "Deadline-sensitive extended tax filing work.",
        "recurrence": "none",
        "status": "pending",
        "visibility": "private",
        "communityShowNotes": false
      }
    },
    {
      "type": "create_task",
      "payload": {
        "date": "2026-09-27",
        "activity": "Clean room",
        "notes": "Bonus task after the higher-priority work is handled, if I have time.",
        "recurrence": "none",
        "status": "pending",
        "visibility": "private",
        "communityShowNotes": false
      }
    }
  ]
}
```

Do not add unsupported fields such as arbitrary `optional`, `order`, or provider-specific metadata to the canonical task payload. Transport metadata belongs in the action envelope/receipt, not in task persistence.

### Raw-language acceptance fixture

Use this exact semantic fixture in end-to-end tests.

Fixture clock and timezone (required inputs — not optional):

- fixed clock: `2026-09-26T15:00:00-04:00`
- timezone: `America/New_York`

Under those inputs, “Tomorrow” resolves deterministically to calendar date `2026-09-27`.

> Tomorrow I want to do my morning routine, get back to Donald about DB Smith, do my taxes, and clean my room if I have time.

Expected result after review approval:

1. exactly four task-create actions;
2. every task date resolves to `2026-09-27` under the fixed clock and `America/New_York` timezone contract above;
3. the morning routine remains one AxTask task with its six-step detail in notes;
4. no duplicate task is created on replay under the accepted idempotency policy;
5. a structured receipt returns one canonical task ID per successful action;
6. the resulting tasks are immediately queryable and operable by ordinary AxTask UI/API surfaces.

If the parser cannot deterministically preserve “if I have time” without inventing unsupported task schema, it must preserve that phrase in notes or return structured clarification; it must not invent a new persistence field.

## Review-and-apply product flow

### Required flow

```text
raw text / speech / external assistant
        ↓
shared parser + action normalization
        ↓
execution policy
        ├─ block      → structured reason
        ├─ review     → action review UI
        └─ autoRun    → only for actions explicitly authorized by policy
        ↓
canonical server action executor
        ↓
task/reminder/update domain services
        ↓
structured receipt
        ↓
ordinary AxTask UI refresh
```

### UI decision

Reuse existing interaction patterns, but do not make the current task-review engine's `ProposedAction` type the canonical assistant contract.

- Reuse the command palette's parse-preview behavior.
- Reuse the bulk-action dialog's checkbox/select-all/partial-failure/retry interaction pattern.
- Create a generic assistant-action review model only after the server action contract exists.
- The UI must render the server-normalized action proposal and submit selected action IDs/records back to the canonical apply endpoint.
- The UI must not recompute dates, recurrence, confidence, dedupe identity, or authorization rules client-side.
- “Apply” mutates only the selected reviewed actions.
- Partial success returns per-action receipts; failed items remain visible and retryable without duplicating already-applied actions.

## Work split: runtime-only versus local-agent-capable

### Runtime-only work

These gates require the active ChatGPT/provider runtime and cannot be proven by a local repository agent alone.

#### RT-0 — Conversation fixture authority

**Owner:** active ChatGPT runtime
**Status:** completed in this plan
**Mission:** distill the user's actual day plan and accepted routine semantics into the exact fixture above.
**Forbidden:** silently adding inferred commitments, dates, priorities, or schema fields.
**Proof:** this plan's reviewed fixture and payload.

#### RT-1 — External assistant live acceptance

**Dependency:** Phase 2 external adapter + scoped auth integrated and deployed to an authorized non-destructive test environment.
**Owner:** active ChatGPT runtime with the installed/connected AxTask adapter.
**Mission:** send a fresh four-task plan through the real external assistant transport, receive structured review/receipt data, and verify the created AxTask records by canonical IDs.
**Forbidden:** production-user mutation without explicit operator authorization; direct DB writes; bypassing review/auth/capability policy.
**Gate:** live provider invocation + AxTask readback.
**Proof ceiling:** provider/runtime integration only; ordinary UI acceptance remains a separate observation.

Local agents must not claim RT-1 from mocked HTTP tests, repository tests, MCP schema generation, or CI.

### Local-agent-capable work

All repository implementation below is suitable for bounded local agents once dependencies are satisfied. No lane may reinterpret architecture or choose alternate owners.

## Dependency graph

```text
W0  PR157-CLOSEOUT
      │
      ├──────────────┬──────────────────┐
      ▼              ▼                  ▼
H0 DISPATCH       A1 TASK-DOMAIN     A2 INTENT-DATE-POLICY
   HARNESS           EXTRACTION          SEMANTICS
      │              │                  │
      └──────┐       └─────────┬────────┘
             │                 ▼
             │             A3 ACTION-EXECUTOR
             │                 │
             │          ┌──────┴──────┐
             │          ▼             ▼
             │      A4 REVIEW-UI   A5 CHANNEL-CONVERGENCE
             │          └──────┬──────┘
             └─────────────────┼─────────────┐
                               ▼             │
                         A6 LOCAL-CONVERGENCE│
                               │             │
                               ▼             │
                         PHASE-1 MAINLINE ◄──┘
                               │
                               ▼
                         B1 AUTH/CAPABILITY
                               │
                               ▼
                         B2 EXTERNAL ADAPTER
                               │
                               ▼
                         RT-1 LIVE ACCEPTANCE
```

After W0, graph width is 3: H0, A1, and A2 may execute concurrently because their mutation owners are disjoint. A3 is a hard join on A1+A2. A4 and A5 may execute concurrently after A3 if collision inspection confirms the declared file boundaries remain disjoint.

## Sprint lanes

### W0 — PR157 planning closeout

**Primary surface:** docs/reporting + queue continuity
**Owner:** PR #157 convergence owner
**Dependencies:** none
**Owned:** this plan, architecture cross-link, AXQ-009 references, one release note required by release guard, dispatch manifest planning artifact.
**Forbidden:** Phase 1 application code; auth; calendar sync; PR #156 files.
**Validation:** queue validator, queue contract test, `npm run release:check`, exact-head CI/reviews.
**Completion:** DONE — PR #157 squash-merged at `80c2629fd6c7602d21d399a92ca6338925e5d4c5`; refreshed `main` contains the plan.

### H0 — Prompt-parallel-dispatch harness bootstrap

**Primary surface:** harness spine
**Dependencies:** W0 mainline
**Owned:**
- `harness/contracts/prompt-parallel-dispatch.v1.json`
- `scripts/prompt_parallel_dispatch.py`
- focused tests for validate/run/verify-receipt
- minimal capability/trigger/workflow registry wiring required to discover the dispatcher
- the existing `Outputs/prompt-parallel-dispatch/manifest.json` only for schema-conformance repair, never for changing lane intent.

**Forbidden:** application task/intent/server/client logic; deployment/auth/database changes; changing lane missions/dependencies to make validation easier; `.ai/harness.json` while PR #139 remains open.
**Implementation contract:**
- `validate` checks required lane fields, dependencies, adapter kind, expected artifacts, validation, convergence owner, and unique lane IDs.
- `run` may execute only `argv` lanes whose dependencies are satisfied; it must not impersonate `runtime_tool` lanes.
- REQUIRED width >=2 may set `observed_parallelism=true` only when at least two independent jobs actually overlap in wall-clock execution.
- `verify-receipt` rejects missing launch evidence, dependency violations, and false parallelism claims.
- Unknown adapters fail closed.
- Receipt records start/end timestamps, exit codes, command identity, artifact paths, and lane status.

**Validation:**
- positive manifest fixture;
- missing-required-field negative fixture;
- dependency-order negative fixture;
- false-parallelism negative fixture;
- runtime-tool impersonation negative fixture;
- two short independent argv lanes proving observed overlap;
- registry/harness validators triggered by changed paths.

**Proof ceiling:** local harness execution; does not prove AxTask application behavior.

### A1 — Canonical task creation service extraction

**Primary surface:** conventional application logic
**Dependencies:** W0 mainline
**Single-writer owned files/surfaces:**
- `server/routes.ts` task-create route block only;
- new shared server-side task-creation domain service under the repository's existing `server/services/` convention;
- focused task-creation parity tests.

**Forbidden:**
- `shared/intent/**`;
- `server/engines/calendar-engine.ts`;
- `client/**`;
- auth/session/schema/migrations;
- provider AI adapter behavior except test doubles required to prove service parity.

**Required behavior extracted from current `POST /api/tasks`:**
- `insertTaskSchema` validation;
- quota enforcement;
- duplicate fingerprint check/record;
- `storage.createTask`;
- priority calculation and derived score/repetition metadata;
- classification/associations/shopping detection currently owned by the route;
- task update with derived fields;
- pattern learning;
- capped unique-task creation reward;
- returned task/result data required by current REST callers.

**Acceptance:** REST route calls the domain service; existing REST behavior remains compatible; focused tests prove each business effect above is still reached through the service; no assistant executor is added in this lane.

### A2 — Raw-utterance, date-only, recurrence, and mutation-policy semantics

**Primary surface:** integration seam / shared intent
**Dependencies:** W0 mainline
**Owned:**
- `shared/intent/parse-natural-command.ts`
- `shared/intent/execution-policy.ts`
- directly related shared intent tests
- `server/engines/calendar-engine.ts` date/query classification behavior and tests
- date-only normalization helper only if required by these owners.

**Forbidden:**
- `server/routes.ts` task-create business workflow;
- provider AI tools;
- client UI;
- auth/schema/migrations.

**Required fixtures:**
1. `Schedule dentist Friday at 3.`
2. `Move the Northwell follow-up to Tuesday.`
3. `Remind me every Thursday to refresh the PM ledger.`
4. `What do I have tomorrow?`
5. the four-task 2026-09-27 day-plan fixture from this document.

**Deterministic decisions:**
- `at <number>` alone must not convert an otherwise explicit scheduled task into a reminder.
- “Remind me every Thursday...” must preserve reminder intent plus recurrence semantics according to one explicit contract; do not accept current recurrence-precedence merely because it exists.
- every mutation exposed to the action contract, including reschedule, gets explicit `autoRun|review|block`; policy-silent mutation defaults to `review` or `block`, never silent mutation.
- date-only values are calendar dates in the configured user/application timezone, not UTC instants serialized through `toISOString()`.
- tests include UTC/local-midnight and DST boundaries.
- ambiguous task resolution returns structured clarification, not best-guess mutation.

**Acceptance:** focused parser/policy/calendar suites prove the fixtures and no current protected intent behavior regresses.

### A3 — Assistant Action Contract v1 server executor

**Primary surface:** application service + integration seam
**Dependencies:** A1 + A2
**Owned:**
- provider-neutral action request/result schemas;
- server executor;
- server routes/endpoints required to normalize/review/apply actions;
- canonical server adapters for task creation, recurring creation, reminder creation, reschedule, and schedule query;
- focused executor/idempotency/receipt tests.

**Forbidden:**
- external auth/token/OAuth/MCP implementation;
- calendar sync;
- new scheduler/database;
- client UX changes;
- PR #156 activity-history ownership.

**Action set for v1:**
- `create_task`
- `create_recurring_task`
- `create_reminder`
- `reschedule_task`
- `query_schedule`

**Required contract fields:** stable action ID, action kind, normalized payload, execution policy state, clarification/review reason when applicable, idempotency key/replay disposition, canonical created/updated entity ID on success, per-action error on failure.

**Idempotency:** retries and concurrent submissions with the same canonical idempotency key must not duplicate mutations. Claiming a key MUST be atomic (unique-key insert/transaction or an equivalent repository-owned primitive); a select-then-insert check is insufficient. One contender owns execution; a concurrent loser receives a deterministic in-progress/replay disposition rather than running the mutation. Successful completion persists a replayable receipt including the canonical entity ID before the action is considered complete. A3 must prove a two-contender concurrent fixture plus post-success replay. Reuse an existing canonical idempotency owner only if it satisfies those semantics; otherwise strengthen the smallest canonical owner rather than adding provider-specific dedupe.

**Acceptance:** both REST task creation and assistant task creation reach A1's same domain service; recurring task persists supported recurrence; reschedule mutates server-side only after policy allows; per-action receipts are deterministic.

### A4 — Generic review-and-apply UI

**Primary surface:** UI consumer
**Dependencies:** A3
**Owned:**
- one generic assistant-action review component;
- command-palette integration for reviewed actions;
- focused UI/unit tests.

**Reuse:** command-palette parse preview and bulk-action-dialog interaction patterns.
**Forbidden:** client-side reimplementation of parser, date, recurrence, dedupe, or authorization rules; `use-voice.tsx`; server executor changes except typed contract imports.
**Required UX:** select all/deselect all; per-action checkbox; normalized title/date/details; clear review/block reason; Apply Selected; per-action partial success; one bounded retry of failed idempotent actions; successful actions disappear or show receipt; failed actions remain visible.
**Acceptance:** the 4-task fixture renders as four reviewed create actions and selected apply calls the canonical apply endpoint once with stable action identities.

### A5 — Existing channel convergence

**Primary surface:** adapters
**Dependencies:** A3
**Owned:**
- `server/ai/tools/create-task.ts`
- `server/ai/tools/create-reminder.ts`
- `server/routes/ai.ts`
- `client/src/hooks/use-voice.tsx`
- directly related tests.

**Forbidden:** new external assistant auth; A4 command-palette/review component; task-domain business logic; schema/migrations.
**Mission:** make existing provider-AI and browser-voice paths delegate to A3 rather than maintaining independent mutation logic.
**Acceptance:** existing channels preserve user-visible behavior but no longer bypass canonical action/domain services for supported v1 actions.

### A6 — Local convergence and Phase 1 proof

**Primary surface:** validation/integration
**Dependencies:** H0 + A3 + A4 + A5
**Owner:** one convergence lane only.
**Mission:** integrate lane heads in dependency order on refreshed main, run collision inspection and combined validation, repair only integration defects, and merge Phase 1 when exact-head gates are green.
**Forbidden:** feature expansion; auth/external adapter work; production deploy.

**Validation order:**
1. `git diff --check <base>...<candidate>`
2. focused A1 tests
3. focused A2 parser/policy/calendar tests
4. focused A3 executor/receipt/idempotency tests
5. focused A4 UI tests
6. focused A5 voice/provider-AI tests
7. `npm run test:ai-eval`
8. `npm run check`
9. `npm test`
10. `npm run build`
11. `npm run release:check`
12. repository-selected validators from changed paths
13. exact-head CI/review
14. merge and refreshed-main containment verification.

**Proof ceiling:** repository/local integration. No external assistant live proof and no production proof.

### B1 — External assistant auth/capability boundary

**Primary surface:** security/integration
**Dependencies:** Phase 1 mainline
**Owner:** dedicated security sprint
**Mission:** define machine-to-machine identity/capabilities distinct from browser session auth.
**Forbidden:** implementing auth inside MCP/provider adapters; broad bearer token with unrestricted actions; production rollout without dedicated security proof.
**Acceptance:** credentials expose only explicitly permitted action/query capabilities and audit identity is preserved.

### B2 — Thin external adapter

**Primary surface:** adapter
**Dependencies:** B1 + Phase 1
**Mission:** implement MCP/plugin/provider adapter as a thin client of Assistant Action Contract v1.
**Forbidden:** domain logic, alternate parser, direct DB writes, alternate scheduler.
**Acceptance:** tool publication is capability-aware; structured requests/results map losslessly to the canonical action contract; local integration tests pass.

## Harness factoring

### Keep

- `axtask.repository-intake.v1`
- `axtask.pr-closeout.v1`
- `axtask.failure-recovery.v1`
- `axtask.parallel-sprint-intake.v1`
- `axtask.agent-workspace-lifecycle.v1`
- `axtask.ai-intent-eval.v1`
- capabilities: repository inspection, PR collision inspection, validator selection, prompt-leap routing, agent workspace lifecycle
- triggers: new-agent-session, close-pr-or-merge, validator-or-workflow-failed, parallel-sprints-requested, agent-workspace-needed, harness-files-changed

### Create in H0

- one `prompt-parallel-dispatch` capability;
- one deterministic trigger from a requested dispatch manifest to the existing parallel-sprint intake + dispatcher workflow;
- the contract/runner/receipt validator named above.

### Do not create

- a second assistant-specific workspace manager;
- a second collision inspector;
- a prompt-only task business-rule implementation;
- a separate model-specific skill for every provider;
- a scheduler capability inside the harness.

## Parallel execution disposition

**Required graph width after W0:** 3 (H0, A1, A2).

**Current ChatGPT runtime adapter ladder:**
1. native child/sub-agent API: not available in this runtime;
2. repository/local agent runner: no connected OpenCode/Cursor/GNHF/AgentSwitchboard execution adapter is exposed to this runtime;
3. connected remote provider/MCP worker: GitHub MCP can inspect/mutate provider state but is not an independent code-execution worker for local lanes;
4. CI fan-out: repository CI can validate commits but no evidence shows a workflow that can independently author H0/A1/A2;
5. local concurrent processes: no AxTask checkout is mounted in this runtime.

Therefore this planning run cannot truthfully prove parallel dispatch. Until H0 is implemented and a local runner consumes the manifest:

`PARALLEL EXECUTION: DEGRADED — graph width is 3 but no safe authoring adapter with >=2 independent workers is exposed to this runtime.`

`AUTONOMY_GAP: implement H0, then local orchestration consumes the validated manifest and launches H0/A1/A2-compatible successors without operator copy/paste scheduling.`

## Contract horizon

| Contract | Owner | Status before implementation | Closing transition |
|---|---|---|---|
| Durable architecture/plan | PR #157 | PROVEN | merged on `main@80c2629fd6c7602d21d399a92ca6338925e5d4c5` |
| Dispatch automation | H0 | REQUIRED SUCCESSOR WORK | contract + runner + verified receipt |
| Canonical task creation | A1 | REQUIRED SUCCESSOR WORK | shared service + REST parity |
| Intent/date/policy semantics | A2 | REQUIRED SUCCESSOR WORK | fixtures + timezone/DST proof |
| Server action contract | A3 | REQUIRED SUCCESSOR WORK | canonical executor + receipts/idempotency |
| Review/apply UX | A4 | REQUIRED SUCCESSOR WORK | UI contract tests |
| Existing voice/AI convergence | A5 | REQUIRED SUCCESSOR WORK | delegation to A3 |
| Phase 1 integration | A6 | REQUIRED SUCCESSOR WORK | combined green + mainline merge |
| External auth/capability | B1 | REQUIRED SUCCESSOR WORK | dedicated security proof |
| External adapter | B2 | REQUIRED SUCCESSOR WORK | adapter integration proof |
| ChatGPT live invocation | RT-1 | BLOCKED | deployed adapter + authorized runtime |
| Production deployment | deployment owner | OUT OF PHASE-1 SCOPE | separate deployment authorization/proof |

## Next executable action

**Owner:** local orchestration / AXQ-009 Phase 1 lanes.
**Action:** create isolated H0, A1, and A2 workspaces from refreshed `origin/main` and launch those three dependency-ready lanes concurrently.
**Then:** A3 joins on A1+A2; A4 ∥ A5 after A3; A6 converges Phase 1.


## Phase 3 — Shared Task Tracker → AxTask convergence

### Evidence reconciliation

This phase is a reconciliation of two already-existing systems, not a greenfield connector:

- The provider-owned Shared Task Tracker has a validated **top-entry staging → canonical append** design with immutable source `TaskID`, formula-owned Priority/Score projections, a fixed active/legacy boundary, and a rejected physical-row-insertion prototype because insertion shifted spill ranges and the legacy boundary.
- AxTask already ships a Google Sheets subsystem in `server/google-sheets-api.ts`, `server/routes.ts`, `client/src/lib/google-api.ts`, and `client/src/pages/google-sheets-sync.tsx`.
- The legacy AxTask subsystem is **not** approved as the Shared Task Tracker ingestion path: its export clears/re-writes `A2:L`; its parser manufactures row-derived temporary IDs; its in-memory sync conflict model does not preserve the tracker's immutable `TaskID`; and the import route reconstructs task-create effects around direct storage writes instead of delegating to the future A1 shared task-domain service.
- Therefore **do not point `/api/google-sheets/sync` at the operator tracker**. The endpoint is still reachable on the current evidence floor; this plan does not pretend otherwise. G3 makes the quarantine real by retiring that mutation endpoint server-side before any controlled live tracker ingestion. Phase 3 converts the remaining subsystem into a reviewed, source-identity-aware one-way ingestion seam and then makes AxTask canonical after cutover.

Private spreadsheet identifiers and task contents are provider state and MUST NOT be copied into this public repository. Repository fixtures use synthetic rows with the same structural contract.

### Source ownership contract

| Concern | Canonical owner |
| --- | --- |
| top-entry interaction while the legacy tracker remains in use | bound Apps Script + provider-owned Task Board |
| source row identity | immutable tracker `TaskID` |
| spreadsheet parsing / Google API transport | AxTask Google Sheets adapter |
| task business rules | A1 shared task-domain service |
| natural-language/assistant actions | A3 Assistant Action Contract executor |
| import idempotency / source receipt | AxTask import identity owner |
| operational task state after cutover | AxTask |
| optional future spreadsheet export | projection only; never peer task authority |

The source adapter MUST resolve fields by header contract and fail closed when required headers are missing. The current tracker contract includes Date, Result, Activity, Notes, Urgency, Impact, Effort, Domain, Tags, Manual Override, and TaskID. Formula-owned Priority and Score are source projections and MUST NOT bypass AxTask's normal derivation rules.

The default ingestion region is the active task region only. The historical/legacy region is excluded unless a separate migration acceptance explicitly includes it.

### S0 — Bound Apps Script deployment + live top-entry proof

**Primary surface:** provider runtime / Google Sheets
**Dependencies:** none
**Queue owner:** AXQ-011
**Mission:** install the exact already-validated top-entry script in the spreadsheet's bound Apps Script project, promote the proven Quick Entry strip on Task Board, and prove one live submission without changing planner row geometry.

**Operator documentation owners:**
- `docs/SHARED_TASK_TRACKER_OPERATOR_GUIDE.md` — canonical old-way → new-way operator tutorial;
- `docs/SHARED_TASK_TRACKER_APPS_SCRIPT_INSTALL_CHECKLIST.md` — canonical one-page S0 install/proof checklist.

These docs may describe and route the provider operation, but the provider-owned workbook `Scripts!B2` value remains the canonical script payload. Do not copy a second source-code authority into Git.

**Deployment contract:**
1. use the provider-owned tracker `Scripts` surface as the source payload; do not reconstruct from chat;
2. install/save/authorize it in the bound project;
3. do **not** publish it as a public web app;
4. promote the validated Quick Entry surface;
5. refresh the spreadsheet so `onEdit`/menu bindings are current;
6. submit one clearly labeled disposable task;
7. read back the created source TaskID and the canonical planner row;
8. verify formula anchors, validation, conditional-format ranges, basic filter, and active/legacy boundary are unchanged;
9. verify success clears the staging row only after commit and a validation error leaves inputs available for correction;
10. persist the live result in the provider-owned validation surface.

**Proof ceiling:** live Google Sheet behavior only. This does not prove AxTask ingestion.

### G1 — Tracker source adapter + dry-run contract

**Primary surface:** Google Sheets adapter / integration seam
**Dependencies:** A6 mainline
**Queue owner:** AXQ-012
**Owned surfaces:** `server/google-sheets-api.ts` or a smaller extracted source adapter, focused synthetic fixtures/tests, minimal route typing required for dry-run.
**Forbidden:** AxTask task creation mutation, client redesign, external assistant auth, live spreadsheet writes.

**Mission:** add a header-aware parser for the Shared Task Tracker source shape and return typed source records without mutating AxTask.

**Required record fields:**
- source provider/binding (configured privately, never hard-coded in public fixtures);
- source TaskID — required and immutable;
- date;
- completed/result state;
- activity;
- notes;
- urgency/impact/effort when present;
- domain/tags when present;
- manual override when supported by the target task-create contract;
- source-region classification: active vs legacy.

**Dry-run dispositions:** `create`, `already_imported`, `invalid`, `legacy_excluded`, and `needs_review` when target semantics cannot be mapped losslessly.

**Acceptance:** row order is irrelevant; changing mutable text while keeping the same source TaskID does not create a second source identity; formula-owned source Priority/Score are ignored as task-authority inputs; malformed/missing TaskID fails closed.

### G2 — Canonical reviewed ingestion action mapping

**Primary surface:** integration service
**Dependencies:** G1 + A6
**Mission:** turn reviewed source records into canonical A3 `create_task` actions so the ingestion path reuses A3 authorization/idempotency/receipts and A1's full normal task-create workflow.

**Required invariants:**
- no direct Google-Sheets-specific `storage.createTask` business workflow;
- each source record maps to a stable action ID/idempotency key derived from `provider + private binding identity + source TaskID`; mutable title/date/notes are payload, never identity;
- A3 owns the atomic idempotency claim and replay receipt. G2 MUST NOT implement a check-then-create dedupe path;
- two concurrent applies for the same source identity are a required negative fixture: exactly one may reach task creation; the other returns A3's deterministic in-progress/replay disposition;
- after successful apply, replay returns the prior canonical AxTask task ID and does not rerun rewards, classification, learning, or other creation side effects;
- quota, duplicate handling, derived priority/classification/shopping associations, pattern learning, rewards, and other ordinary creation effects remain owned by A1 through A3;
- imports are one-way creates in the first slice. A later edit in Sheets MUST NOT silently overwrite an AxTask task.

**Existing persistence evidence:** `task_import_fingerprints` already has a unique `(user_id, fingerprint)` index, but the current `hasImportFingerprint() -> create task -> recordImportFingerprint()` flow is not an atomic mutation claim. It may remain useful for legacy import dedupe, but it is not sufficient by itself for G2 concurrency. G2 must use A3's proved atomic action-idempotency owner.

**Acceptance:** simultaneous apply of the same source TaskID produces one canonical task; post-success replay returns the same A3 receipt/task ID; mutable source text does not fork identity; ordinary AxTask creation parity tests remain green.

### G3 — Review/apply experience and legacy sync quarantine

**Primary surface:** UI consumer + route policy
**Dependencies:** G2
**Mission:** modernize the existing Google Sheets Sync screen around dry-run/review/apply and retire the current destructive bidirectional sync path at the server boundary.

**Reuse:** A4 generic review-and-apply interaction patterns when practical.

**Required UX:**
- connect/select an authorized spreadsheet binding without exposing credentials;
- explicit source sheet and active-region summary;
- counts for create/already-imported/invalid/legacy-excluded/review;
- row-level selection before apply;
- per-row result receipts after apply;
- bounded retry only for idempotent failures;
- `POST /api/google-sheets/sync` is retired server-side for all callers in this phase and returns an explicit non-mutating retirement response (for example HTTP 410 with the reviewed-ingestion replacement path); UI removal is defense-in-depth, not the enforcement boundary;
- a future bidirectional sync may be reintroduced only as a new separately proved stable-identity/conflict contract, never by silently re-enabling this endpoint.

**Acceptance:** direct HTTP calls to the legacy sync endpoint cannot mutate any spreadsheet or AxTask task; the UI exposes dry-run/review/apply instead; selected apply maps exactly to G2/A3 receipts.

### G4 — Controlled live ingestion acceptance

**Primary surface:** runtime proof
**Dependencies:** G3 + S0
**Mission:** prove the real operator tracker can be ingested without duplicate or overwrite behavior.

**Run order:**
1. authorize read access to the exact provider binding;
2. run **dry-run only** and review counts/errors first;
3. do not import the legacy region;
4. apply a bounded operator-approved sample;
5. read back created AxTask tasks by canonical AxTask IDs and source TaskID receipts;
6. rerun the same source sample and prove zero duplicate creates;
7. only after sample proof, run the operator-approved active-region batch;
8. retain a sanitized receipt summary without private task contents.

**Proof ceiling:** authorized live ingestion into the selected AxTask account. It does not by itself authorize broad production rollout to other users.

### G5 — Canonical cutover and old-sync disposition

**Primary surface:** integration closeout
**Dependencies:** G4
**Mission:** remove split-brain ownership after successful ingestion.

**Required end state:**
- AxTask is the operational task authority for new/edited tasks;
- direct dictation/assistant paths create through the Assistant Action Contract, not through Sheets;
- the legacy tracker may remain an optional manual producer during a bounded transition, or become read-only/archive/projection;
- bidirectional spreadsheet merge remains disabled for this binding unless separately redesigned and proved;
- optional AxTask → Sheet export is a projection and MUST NOT imply peer authority;
- documentation clearly distinguishes migration/import from sync.

**Acceptance:** a user can dictate/create in AxTask, inspect the canonical task there, and re-run the old source dry-run without producing duplicates; no required workflow depends on spreadsheet row insertion or row-number identity.

### Phase 3 dependency order

```text
S0  (provider deployment; independent operator/runtime gate)

A6 ──> G1 ──> G2 ──> G3
                    │
S0 ─────────────────┘
        G3 + S0 ──> G4 ──> G5

A6 ──> B1 ──> B2 ──> RT-1   (existing direct-assistant path)
```

S0 can proceed while Phase 1 is being implemented. G1 waits for A6 so the importer cannot institutionalize a second task-create workflow immediately before A1/A3 convergence. B1/B2/RT-1 remain the direct assistant path; after G5, dictation should create canonical AxTask tasks without Sheets in the loop.

### Phase 3 proof ceiling

Repository proof can validate parser/source identity, idempotency, task-domain delegation, UI review behavior, and quarantine of the old sync path. Bound Apps Script deployment and real spreadsheet ingestion require their respective provider/runtime surfaces and must not be promoted from repository-only evidence.
