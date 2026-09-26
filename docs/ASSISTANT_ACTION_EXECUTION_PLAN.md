# Assistant Action Execution Plan

**Status:** ACTIVE EXECUTION MAP — implementation blocked until PR #157 is merged
**Date:** 2026-09-26
**Evidence floor:** `main@7af06d7a9cf638dfe1c96a1e2b85914edb610f76`
**Planning owner:** PR #157 / `docs/ASSISTANT_ACTION_REFERENCE_ARCHITECTURE.md`
**Queue index:** `.ai/WORK_QUEUE.md` → `AXQ-009`
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
- **Main HEAD:** `7af06d7a9cf638dfe1c96a1e2b85914edb610f76`
- **Active planning PR:** #157, branch `docs/assistant-action-reference-architecture-20260913`
- **PR #157 head before this execution-map update:** `1e3aee78311b6b5d5f78a0107d36596f9eb8bb00`
- **PR #156:** open and separately owns activity-history/reporting; do not modify from AXQ-009 lanes.
- **PR #155:** open calendar overflow fix; inspect collision before touching calendar UI files.
- **PR #139:** open harness infrastructure branch; harness lane must inspect it before writing shared harness surfaces.
- **PR #157 CI evidence:** typecheck passed; 272 test files passed with 1,951 tests passed and 40 skipped; offline AI intent eval passed 16/16; `release:check` failed only because no `docs/releases/*.md` file changed.
- **Existing harness:** repository intake, PR closeout, failure recovery, parallel sprint intake, PR-collision inspection, managed agent workspaces, capability/trigger registries, validator selection.
- **Missing requested dispatch seam:** `harness/contracts/prompt-parallel-dispatch.v1.json` and `scripts/prompt_parallel_dispatch.py` are absent on the evidence floor. The manifest therefore remains bootstrap-blocked until lane H0 creates and proves those owners.

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
        "notes": "Bonus task after the higher-priority work is handled.",
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

Use this exact semantic fixture in end-to-end tests:

> Tomorrow I want to do my morning routine, get back to Donald about DB Smith, do my taxes, and clean my room if I have time.

Expected result after review approval:

1. exactly four task-create actions;
2. every task date resolves to `2026-09-27` under the configured user/application timezone contract;
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
**Completion:** PR #157 review-clean, exact-head required checks green, merged, and refreshed `main` contains the plan.

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

**Idempotency:** retries must not duplicate already-successful mutations. The implementation may reuse an existing canonical idempotency/fingerprint mechanism when semantics match; it must not invent a second silent dedupe store without proving necessity.

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
| Durable architecture/plan | PR #157 | IN PROGRESS | exact-head CI/review green + merge |
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

**Owner:** PR #157 convergence lane.
**Action:** add the required release note, run the queue validators and release guard, let exact-head CI/review evaluate the updated planning branch, repair only still-valid planning/harness-documentation findings, and merge #157 when green.
**Then:** local orchestration creates isolated H0/A1/A2 workspaces from refreshed main and launches those three lanes concurrently.
