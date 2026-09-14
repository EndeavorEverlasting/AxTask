# Assistant Action Reference Architecture

**Status:** ACTIVE PLAN  
**Date:** 2026-09-13  
**Evidence floor:** `main@7af06d7a9cf638dfe1c96a1e2b85914edb610f76`  
**Continuity index:** `.ai/WORK_QUEUE.md` → `AXQ-009`

## Outcome

AxTask should make schedule/task dictation feel like a direct application action, not like maintaining a second calendar beside the task system.

Target experience:

- “Schedule dentist Friday at 3.”
- “Move the Northwell follow-up to Tuesday.”
- “Remind me every Thursday to refresh the PM ledger.”
- “What do I have tomorrow?”

Every supported channel should resolve that language through the same AxTask intent/action contracts and mutate or query AxTask’s canonical task/reminder state. Project/domain ledgers remain evidence/history authorities. Connectors, voice, LLMs, MCP, and calendars are transports or projections; they do not become competing schedule authorities.

This plan is reference-architecture research plus a bounded successor map. It does not authorize production deployment, authentication changes, calendar synchronization, scheduled-worker enablement, or a new scheduler/database.

## Fresh local floor

### OBSERVED_IMPLEMENTED

Current `main` already contains most of the hard semantic work:

| Capability | Current owner/evidence | Observation |
| --- | --- | --- |
| Natural-language command parsing | `shared/intent/parse-natural-command.ts` | Parses task/reminder/recurrence/date/time language and strips recognized command phrases. |
| Typed command vocabulary | `shared/intent/intent-types.ts` | Includes `create_task`, `create_reminder`, `create_recurring_task`, planning, navigation, search, task review, and alarm list. |
| Deterministic execution policy | `shared/intent/execution-policy.ts` | Produces `autoRun`, `review`, or `block`; creation/planning/review commands require review and low-confidence commands do not silently execute. |
| Dispatcher mapping | `shared/intent/map-to-dispatcher.ts`, `server/engines/dispatcher.ts` | Maps parsed commands into task, calendar, reminder, search, planning, and review engine buckets. |
| Calendar language | `server/engines/calendar-engine.ts` | Resolves reschedule, date query, and create-on-date phrases into structured action envelopes. |
| Canonical task persistence | `server/storage.ts`, `/api/tasks` routes | Task CRUD and business rules already exist. |
| Server-side AI task creation | `server/ai/tools/create-task.ts` | Uses quota enforcement plus `storage.createTask`; this is already a server-side domain mutation. |
| Server-side AI reminder creation | `server/ai/tools/create-reminder.ts` | Existing provider-facing tool path persists reminders server-side. |
| Browser voice execution | `client/src/hooks/use-voice.tsx` | Consumes dispatcher actions and performs some mutations through normal task APIs. |

### PARTIAL / SPLIT OWNERSHIP

The current implementation has two different execution shapes:

1. Provider AI `/api/ai/execute` can directly create a task/reminder server-side, but its `AiIntentResult` schema only supports `create_task`, `create_reminder`, and `clarification`.
2. The richer shared parser/dispatcher can resolve recurring task creation and calendar rescheduling, but some resulting actions are applied by browser code. For example, `calendar-engine.ts` emits `reschedule_task`, while `client/src/hooks/use-voice.tsx` performs the actual `syncUpdateTask` call.

That split is the local seam worth closing. The missing capability is not “natural-language scheduling”; it is a transport-neutral, server-side domain action executor that every channel can call without duplicating mutation logic.

### ABSENT IN INSPECTED CURRENT MAIN

- A machine-to-machine assistant authentication/capability mechanism distinct from the browser session cookie.
- One provider-neutral external action contract covering the richer shared command set.
- A connector/MCP/plugin adapter registered as a thin client of AxTask domain actions.
- A merged ledger-to-AxTask interoperability contract from PR #156; that PR remains a separate activity-history/reporting lane.

### AUTHORITY BOUNDARY

- **Project/domain ledgers:** evidence, provenance, accomplishment/history, and project-specific narrative authority.
- **AxTask:** operational task/reminder/schedule mutation authority.
- **Assistant/voice/MCP/plugin:** input and action transport only.
- **External calendar:** optional projection/interoperability surface by default, not a peer canonical task store.

## External reference set

Evidence was inspected at the identities below on 2026-09-13. README claims were not used as sole implementation proof.

| Reference | Evidence identity | License | Why it belongs | Key inspected implementation |
| --- | --- | --- | --- | --- |
| Home Assistant Core | `home-assistant/core@09e3474f91be03d4ac5a70a698474986fc759bcf` (`dev`) | Apache-2.0 | Strong example of exposing existing domain intents as assistant tools without moving mutation authority into the LLM layer. | `homeassistant/components/todo/intent.py`, `homeassistant/components/todo/llm.py` |
| Vikunja | `go-vikunja/vikunja@6be4696be507844395d17f5b49b72a17deb8a795` | AGPL-3.0 | Rich quick-add parsing into the normal task service; useful precedent for keeping input magic upstream of canonical task persistence. | `frontend/src/modules/quickAddMagic/quickAddMagic.ts`, `frontend/src/stores/tasks.ts`, task model/recurrence code |
| Taskwarrior | `GothenburgBitFactory/taskwarrior@ad9c6d95564f92ef7011232fa970f4d51d73361d` (`develop`) | MIT | Proven transport-neutral task JSON and hook seam with accept/reject behavior and extensive tests. | `src/Hooks.cpp`, `scripts/hooks/on-add`, `test/hooks.on-add.test.py` |
| Nextcloud Tasks | `nextcloud/tasks@18bdd3f5b7633d710d53ba6b899adec8426f83a5` | AGPL-3.0 | Mature CalDAV/VTODO interoperability and a useful boundary lesson: external/peer calendar-source synchronization is a separate complexity, not free task authority. | `src/services/cdav.js`, `src/store/tasks.js`, `src/store/cdav-requests.js` |
| Vikunja MCP | `democratize-technology/vikunja-mcp@a42e1c2a3bd2b694e79a944fba5153970157b19d` | MIT | Direct example of an MCP layer delegating to a task system and conditionally publishing tools according to available auth/capabilities. | `src/tools/index.ts`, `src/tools/task-crud.ts`, `src/tools/tasks/crud/TaskCreationService.ts` |

No direct source copying is planned. AGPL projects are mechanism references only unless a later licensing review explicitly authorizes code reuse. AxTask currently has no detected repository license metadata, so mechanism emulation is the conservative default for every reference.

## Reference mechanisms

### Home Assistant — domain intents first, LLM tools second

**OBSERVED_IMPLEMENTED**

`todo/intent.py` owns typed list-add/complete/remove handlers and validates target/entity/item slots before calling the todo entity. `todo/llm.py` then exposes those already-owned intents as LLM tools and filters entities through normal assistant exposure rules.

Mechanism:

`assistant tool -> typed domain intent -> permission/exposure check -> canonical domain entity/service -> structured response`

**Disposition: ADOPT.** AxTask should expose domain actions to an assistant rather than teaching an assistant adapter to mutate tasks independently.

### Vikunja — rich input parser, ordinary task service

**OBSERVED_IMPLEMENTED**

Quick Add composes independent date, project, label, assignee, priority, and repeat parsers. The parsed result becomes a normal task object and flows through the regular task store/service. Quoting the whole input acts as an escape hatch from magic parsing.

Mechanism:

`free text -> independent parsers -> normalized task fields -> canonical task service`

**Disposition: ADOPT/ADAPT.** AxTask already has most of this parser layer; reuse the principle and existing AxTask parser rather than adding another natural-language grammar. Do not copy AGPL code.

### Taskwarrior — machine-readable extension seam

**OBSERVED_IMPLEMENTED**

Taskwarrior hook execution passes JSON task objects to `on-add`/`on-modify` hooks, allows accept/reject/transform behavior, and carries dedicated tests for well-behaved and misbehaving hooks. Its export surface is machine-readable independent of UI.

Mechanism:

`stable structured request/record -> extension boundary -> accept/reject/transform -> canonical store`

**Disposition: ADAPT.** AxTask should define a stable request/result/clarification action envelope that remains usable whether the transport is REST, a ChatGPT connector, MCP, voice, or another local agent.

### Nextcloud Tasks — interoperability is valuable; peer authority is expensive

**OBSERVED_IMPLEMENTED**

Nextcloud Tasks maps its task model to DAV/VTODO objects and creates/updates them through a CalDAV collection. Current source also demonstrates the amount of recurrence, timezone, identity, parent/child, synchronization, and error handling carried by a mature interoperable task client.

**DOCUMENTED_UNVERIFIED / ecosystem signal:** an open upstream request for acting as a client of arbitrary external CalDAV sources reinforces that “our task system is also a client of another task/calendar authority” is its own product problem.

Mechanism:

`canonical task model <-> standards adapter <-> calendar/task interoperability server`

**Disposition: ADAPT for projection; REJECT peer canonical truth in the first slices.** Calendar projection can be added later, but assistant dictation should not require AxTask and Google/CalDAV to negotiate dual authority.

### Vikunja MCP — assistant adapter with capability-aware tool registration

**OBSERVED_IMPLEMENTED**

The MCP server registers task tools around the Vikunja client and conditionally publishes broader operations only when the required client/auth capability is available. Task CRUD remains delegated to the underlying task API/service.

Mechanism:

`assistant protocol adapter -> capability/auth-filtered tool registry -> existing task API -> structured result`

**Disposition: ADOPT mechanism, ADAPT transport.** MCP is a candidate adapter, not the canonical owner. The same AxTask action contract must remain callable by non-MCP transports.

## Pattern ledger

| Pattern | Disposition | AxTask consequence |
| --- | --- | --- |
| Domain-owned mutation with thin assistant tool adapter | **ADOPT** | Build one server action owner; adapters delegate to it. |
| Capability/auth filtering before tools are exposed | **ADOPT** | External adapters publish only actions allowed by their credential/capability. |
| Natural language -> typed command -> normal task service | **ADOPT** | Keep `shared/intent/*` as parsing/policy authority; do not create a second parser. |
| Structured clarification/failure instead of model guessing | **ADOPT** | Ambiguous/review-required commands return typed clarification/review state. |
| Transport-neutral machine-readable action/result envelope | **ADAPT** | Stable contract first; REST/plugin/MCP are replaceable adapters. |
| MCP wrapper | **ADAPT** | Useful adapter after the action contract; never canonical task authority. |
| CalDAV/calendar interoperability | **ADAPT** | Later projection/export/sync phase with explicit conflict rules. |
| External assistant authentication | **ADAPT** | Dedicated security sprint because current AxTask external paths are browser-session based. |
| Standalone assistant scheduler/database | **REJECT** | Would recreate the ledger/AxTask rift. |
| Project ledgers as executable schedule state | **REJECT** | Ledgers retain evidence/history authority; AxTask owns operational scheduling. |
| Google/CalDAV as peer canonical task store by default | **REJECT** | Introduces conflict/identity semantics before assistant capture is solved. |
| Provider-specific `AiIntentResult` as canonical domain contract | **REJECT** | It is narrower than `shared/intent/*` and couples domain behavior to one AI route. |
| Direct AGPL code reuse | **REJECT pending explicit license review** | Emulate mechanisms only. |
| Exact assistant transport to ship first | **UNKNOWN** | Decide after the provider-neutral action contract exists and can be tested locally. |

## Solved baseline vs remaining gap

### ALREADY_SOLVED_INTERNALLY

- natural-language task/reminder/recurrence parsing;
- date/time and recurrence normalization;
- typed command kinds;
- confidence/review/block policy;
- canonical task storage and HTTP CRUD;
- server-side AI creation of tasks/reminders;
- calendar query/reschedule intent resolution;
- voice UX and client-side execution of resolved actions;
- recurring reminder/task mechanics already represented in product contracts.

### AVAILABLE_TO_EMULATE_EXTERNALLY

- LLM/tool adapter over domain intents — Home Assistant;
- capability-filtered tool publication — Home Assistant and Vikunja MCP;
- stable structured extension/action envelope — Taskwarrior;
- one-line structured capture through canonical persistence — Vikunja;
- optional standards-based task/calendar projection — Nextcloud Tasks/CalDAV.

### PROJECT_SPECIFIC_GAP

1. **Assistant Action Contract v1:** one canonical server-side action executor for supported AxTask task/schedule mutations.
2. **External assistant auth/capability scope:** a dedicated later security sprint; current `requireAuth` is browser-session oriented.
3. **Authority contract:** preserve the rule that ledgers are evidence/history, AxTask is operational schedule/task state, adapters are transports, and calendars are projections unless explicitly promoted by a later product decision.

### EVIDENCE GAP

- Production reachability/authentication from any specific assistant provider is unproven by repository evidence.
- No live external assistant tool execution has been observed.
- Calendar projection field mapping/conflict semantics and user acceptance remain untested.
- The optimal first adapter transport is intentionally not selected before the provider-neutral contract exists.

## Prioritized development gap: Assistant Action Contract v1

### Exact local owner/seam

The canonical owner should be the **server task-domain execution seam backed by existing `server/storage` task/reminder business rules and `shared/intent` contracts**. Resolve the exact physical module path at implementation time from the current module-split state; do not make `server/ai` or a future MCP/plugin directory the domain owner.

The immediate structural debt to close is:

- `calendar-engine.ts` can resolve `reschedule_task`, but `use-voice.tsx` performs the mutation;
- `server/ai/tools/create-task.ts` performs a direct server-side mutation through storage;
- provider AI intent schemas cover a smaller command set than the shared parser.

The action contract should make those channels converge on one server-owned mutation path.

### Reference mechanisms to emulate

- Home Assistant: assistant tools wrap existing domain actions.
- Vikunja: rich parsing is upstream of normal task persistence.
- Taskwarrior: stable structured request/result boundary independent of UI.
- Vikunja MCP: tool publication is capability-aware.

### Phase 1 supported behavior

Start with the smallest set that proves the seam:

- create task;
- create recurring task;
- create reminder;
- reschedule task;
- read-only schedule/date query when it falls naturally through the same contract.

The result must return canonical task/reminder IDs when applicable, normalized schedule fields, execution/review state, and structured clarification/failure information.

### Phase 1 local adaptations

- Reuse `shared/intent` parsing and execution policy rather than inventing a connector grammar.
- Reuse task/reminder storage, quotas, and domain validation.
- Keep low-confidence/review-required behavior fail-closed; an external model may not silently promote a review action into mutation.
- Factor browser voice and provider AI toward the same domain action executor incrementally; preserve current import/API compatibility.
- Decide retry/idempotency semantics before any external network adapter can safely replay mutations.

### Phase 1 non-goals

- no production authentication changes;
- no API tokens/OAuth/MCP credentials;
- no Google Calendar/CalDAV synchronization;
- no scheduled-worker enablement;
- no new task database/schema solely for the assistant;
- no ledger mutation from the action executor;
- no change to PR #156 activity-history ownership;
- no production deployment from the reference-architecture sprint.

### Phase 1 proof gate

A bounded implementation sprint must prove, with deterministic tests:

1. supported parsed commands map to one server action contract;
2. create/reschedule/recurrence/reminder mutations use canonical domain persistence/business rules;
3. ambiguous, blocked, or review-required input does not silently mutate;
4. structured action receipts expose canonical IDs/result state without provider-specific response types;
5. retries/idempotency have an explicit tested policy before an external adapter is allowed to mutate;
6. existing voice/AI/task contracts remain green;
7. no auth, migration, scheduled-resource, or production deployment surface changed.

The proof ceiling is repository behavior only. It does not prove assistant-provider connectivity, production authentication, deployed runtime behavior, or user acceptance.

### Evidence that would invalidate this choice

Re-open the design if refreshed current `main` proves that:

- a provider-neutral server-side action executor already owns all of the above mutations;
- a current canonical product contract deliberately makes an external calendar the operational source of truth;
- the task-domain module split materially changes the safe owner before implementation starts;
- external assistant requirements cannot be met without first changing authentication, in which case Phase 1 must remain mutation-local and the auth sprint becomes the real external-access dependency.

## Successor phase map

### Phase 0 — Reference architecture and authority boundary

**Status:** this document.  
**Artifact:** `docs/ASSISTANT_ACTION_REFERENCE_ARCHITECTURE.md`  
**Gate:** external mechanisms and local gap are evidence-backed; continuity indexed by `AXQ-009`.

### Phase 1 — Assistant Action Contract v1

**Owner:** server task-domain execution seam + `shared/intent` contracts.  
**Artifacts:** provider-neutral action/result types, server executor, focused tests, compatibility wiring for existing channels as appropriate.  
**Forbidden:** auth changes, production deploy, external calendar sync, MCP as domain owner.  
**Gate:** proof criteria above pass.

### Phase 2 — External assistant adapter and scoped authentication

**Dependency:** Phase 1 stable action contract.  
**Owner:** dedicated adapter plus dedicated auth/security sprint.  
**Reference:** Home Assistant/Vikunja MCP capability-aware tool exposure.  
**Gate:** an external assistant credential can expose only permitted actions and execute against the same domain contract with audit/receipt evidence.  
**Proof ceiling:** external/provider connectivity requires protected runtime evidence.

### Phase 3 — Optional calendar projection/interoperability

**Dependency:** stable AxTask action identity plus explicit user need.  
**Owner:** separate interoperability adapter.  
**Reference:** Nextcloud Tasks/CalDAV.  
**Default authority:** AxTask remains canonical; calendar is projection.  
**Gate:** field mapping, identity, recurrence/timezone handling, conflict policy, retry behavior, and rollback are tested before writable synchronization.

### Phase 4 — Ledger provenance bridge

**Dependency:** PR #156 or its successor establishes the accepted `ledger/v1` producer contract.  
**Owner:** activity/provenance projection, not schedule mutation.  
**Rule:** project ledgers may point to or summarize AxTask schedule/task identities; they do not become an execution queue for schedule mutation.

## Collision and safety notes

- PR #156 owns activity-history/reporting projection and should not be modified by this lane.
- AXQ-001 through AXQ-008 remain production-recovery priorities and are unaffected by this lower-priority product capability.
- Authentication/session changes remain a dedicated sprint under `AGENT_GUARDRAILS.md`.
- Production scheduled resources remain off unless separately justified under `docs/SCHEDULED_RESOURCE_CONTROLS.md`.
- No reference-architecture claim is deployment proof.

## Next executable action

**Owner:** next bounded AxTask implementation agent.  
**Dependency:** this plan merged on current `main`; no dependency on calendar integration or PR #156.  
**Action:** create the Phase 1 implementation sprint by reconciling the current `shared/intent` parser/policy, `calendar-engine.ts`, provider AI tools, task/reminder storage, and existing tests; implement the smallest provider-neutral server action executor covering create task, create recurring task, create reminder, and reschedule task; then run its focused contracts plus affected existing suites.  
**Expected proof:** one merged server-owned action path with deterministic mutation/clarification receipts and no auth/calendar/production-surface changes.  
**Completion gate:** all Phase 1 proof criteria above are satisfied on the exact integrated default-branch head.
