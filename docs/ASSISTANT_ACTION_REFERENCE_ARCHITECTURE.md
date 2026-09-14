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

Current `main` already contains much of the semantic and persistence foundation:

| Capability | Current owner/evidence | Observation |
| --- | --- | --- |
| Natural-language command parsing | `shared/intent/parse-natural-command.ts` | Parses task/reminder/recurrence/date/time language and strips recognized command phrases. |
| Typed command vocabulary | `shared/intent/intent-types.ts` | Includes `create_task`, `create_reminder`, `create_recurring_task`, planning, navigation, search, task review, and alarm list. |
| Deterministic execution policy | `shared/intent/execution-policy.ts` | Produces `autoRun`, `review`, or `block`; creation/planning/review commands require review and low-confidence parsed commands do not silently execute. |
| Dispatcher mapping | `shared/intent/map-to-dispatcher.ts`, `server/engines/dispatcher.ts` | Maps parsed commands into task, calendar, reminder, search, planning, and review engine buckets. |
| Calendar language | `server/engines/calendar-engine.ts` | Resolves reschedule, date query, and create-on-date phrases into structured action envelopes. |
| Task storage primitives | `server/storage.ts`, task schema | Canonical database CRUD exists. |
| Full normal task-create workflow | `POST /api/tasks` in `server/routes.ts` | Validates input, enforces quota, rejects duplicate fingerprints, creates the task, calculates priority, classifies, learns patterns, awards capped creation rewards, and returns task plus derived results. |
| Server-side AI task creation | `server/ai/tools/create-task.ts` | Uses quota enforcement plus `storage.createTask`, but bypasses several behaviors in the normal REST task-create workflow and forces `recurrence: "none"`. |
| Server-side AI reminder creation | `server/ai/tools/create-reminder.ts` | Existing provider-facing tool path persists reminders server-side. |
| Browser voice execution | `client/src/hooks/use-voice.tsx` | Consumes dispatcher actions and performs some mutations through normal task APIs. |

### PARTIAL / SPLIT OWNERSHIP

The current implementation has multiple execution and normalization shapes that Phase 1 must deliberately converge:

1. Provider AI `/api/ai/execute` can directly create a task/reminder server-side, but its `AiIntentResult` schema only supports `create_task`, `create_reminder`, and `clarification`.
2. The richer shared parser/dispatcher can recognize recurring task creation and calendar rescheduling, but some resulting actions are applied by browser code. For example, `calendar-engine.ts` emits `reschedule_task`, while `client/src/hooks/use-voice.tsx` performs the actual `syncUpdateTask` call.
3. `create_recurring_task` parsing does not currently prove a canonical server mutation path. The dispatcher produces a task prefill action, while `server/ai/tools/create-task.ts` explicitly persists `recurrence: "none"`. Recurrence parsing/model representation is therefore solved more strongly than recurring-task execution.
4. Date handling is not yet a single proven contract. `calendar-engine.ts` resolves relative/local days with `Date` operations and then serializes through UTC `toISOString()`, which can shift a date-only value near midnight in non-UTC time zones. Phase 1 must choose and test an explicit timezone/date-only normalization rule before treating schedule dates as canonical.
5. The shared execution policy covers parsed command kinds, but calendar rescheduling is classified through a separate calendar path. The current voice path can apply a resolved `reschedule_task`; Phase 1 must define an explicit review/authorization rule for reschedule mutations instead of assuming create-task review policy covers them.
6. `storage.createTask` is not the complete task-create business-rule owner. The normal `/api/tasks` route additionally owns validation, quota, duplicate-fingerprint handling, priority calculation, classification/associations, pattern learning, and creation rewards. A new assistant executor that calls storage directly would preserve the current behavioral split rather than close it.
7. The advertised raw utterances are not yet a proven input contract. On the inspected floor, parser/calendar detector precedence can classify or miss them differently than the desired user experience. Phase 1 must start its acceptance tests from the raw sentences, not only from already-normalized intents.

That split is the local seam worth closing. The missing capability is not “natural-language scheduling”; it is a provider-neutral, server-side domain action contract backed by the same task business rules as normal REST creation, plus explicit mutation/date semantics and raw-utterance acceptance proof.

### ABSENT IN INSPECTED CURRENT MAIN

- A machine-to-machine assistant authentication/capability mechanism distinct from the browser session cookie.
- One provider-neutral external action contract covering the richer shared command set.
- A connector/MCP/plugin adapter registered as a thin client of AxTask domain actions.
- A shared task-domain service that both REST creation and assistant creation call for the full normal task-create business-rule pipeline.
- A canonical server mutation path for recurring-task creation that reuses the shared recurrence semantics.
- A single explicit date-only/timezone contract shared by calendar resolution and external action execution.
- End-to-end acceptance fixtures for the four target dictated utterances.
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

`assistant tool -> typed domain intent -> permission/exposure check -> canonical domain service -> structured response`

**Disposition: ADOPT.** AxTask should expose domain actions to an assistant rather than teaching an assistant adapter to mutate tasks independently. The AxTask adaptation is to extract the real task-create domain workflow out of the HTTP route before making it an assistant tool.

### Vikunja — rich input parser, ordinary task service

**OBSERVED_IMPLEMENTED**

Quick Add composes independent date, project, label, assignee, priority, and repeat parsers. The parsed result becomes a normal task object and flows through the regular task store/service. Quoting the whole input acts as an escape hatch from magic parsing.

Mechanism:

`free text -> independent parsers -> normalized task fields -> canonical task service`

**Disposition: ADOPT/ADAPT.** AxTask already has much of this parser layer; reuse the principle and existing AxTask parser rather than adding another natural-language grammar. Phase 1 still has to close AxTask’s own recurring-mutation, raw-utterance, and date/timezone execution gaps. Do not copy AGPL code.

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
| Domain-owned mutation with thin assistant tool adapter | **ADOPT** | Extract the full normal task-create workflow into one domain service; adapters delegate to it. |
| Capability/auth filtering before tools are exposed | **ADOPT** | External adapters publish only actions allowed by their credential/capability. |
| Natural language -> typed command -> normal task service | **ADOPT** | Keep `shared/intent/*` as parsing/policy authority, repair target utterances there, and do not create a second parser. |
| Structured clarification/failure instead of model guessing | **ADOPT** | Ambiguous/review-required commands return typed clarification/review state. |
| Transport-neutral machine-readable action/result envelope | **ADAPT** | Stable contract first; REST/plugin/MCP are replaceable adapters. |
| MCP wrapper | **ADAPT** | Useful adapter after the action contract; never canonical task authority. |
| CalDAV/calendar interoperability | **ADAPT** | Later projection/export/sync phase with explicit conflict and timezone rules. |
| External assistant authentication | **ADAPT** | Dedicated security sprint because current AxTask external paths are browser-session based. |
| Standalone assistant scheduler/database | **REJECT** | Would recreate the ledger/AxTask rift. |
| Project ledgers as executable schedule state | **REJECT** | Ledgers retain evidence/history authority; AxTask owns operational scheduling. |
| Google/CalDAV as peer canonical task store by default | **REJECT** | Introduces conflict/identity semantics before assistant capture is solved. |
| Provider-specific `AiIntentResult` as canonical domain contract | **REJECT** | It is narrower than `shared/intent/*` and couples domain behavior to one AI route. |
| Direct AGPL code reuse | **REJECT pending explicit license review** | Emulate mechanisms only. |
| Exact assistant transport to ship first | **UNKNOWN** | Decide after the provider-neutral action contract exists and can be tested locally. |

## Solved baseline vs remaining gap

### ALREADY_SOLVED_INTERNALLY

- natural-language task/reminder/recurrence parser foundation;
- typed command kinds;
- confidence/review/block policy for the shared parsed-command path;
- task storage primitives;
- the full normal REST task-create business workflow, though currently embedded in `server/routes.ts`;
- server-side AI creation of non-recurring tasks/reminders, though task creation does not reuse the full normal REST workflow;
- calendar query/reschedule intent resolution;
- voice UX and client-side execution of resolved actions;
- recurrence fields/model semantics already represented in product contracts.

### AVAILABLE_TO_EMULATE_EXTERNALLY

- LLM/tool adapter over domain intents — Home Assistant;
- capability-filtered tool publication — Home Assistant and Vikunja MCP;
- stable structured extension/action envelope — Taskwarrior;
- one-line structured capture through canonical persistence — Vikunja;
- optional standards-based task/calendar projection — Nextcloud Tasks/CalDAV.

### PROJECT_SPECIFIC_GAP

1. **Shared task-domain service:** extract the full `/api/tasks` task-create workflow out of the HTTP route so REST and assistant creation share validation, quotas, duplicate prevention, priority/classification enrichment, pattern learning, and rewards.
2. **Assistant Action Contract v1:** one canonical server-side executor for supported AxTask task/schedule actions over that domain service and existing reminder/update services.
3. **Raw-utterance semantics:** make the four target dictated sentences deterministic end to end instead of testing only normalized commands.
4. **Recurring-task execution:** carry already-parsed recurrence into canonical server persistence rather than stopping at prefill or forcing `recurrence: "none"`.
5. **Date-only/timezone semantics:** define one deterministic schedule-date rule that cannot shift across UTC/local conversion near midnight.
6. **Mutation review policy:** explicitly cover reschedule and every other action-contract mutation; no transport may bypass review merely because it arrived through the calendar/voice path.
7. **External assistant auth/capability scope:** a dedicated later security sprint; current `requireAuth` is browser-session oriented.
8. **Authority contract:** preserve the rule that ledgers are evidence/history, AxTask is operational schedule/task state, adapters are transports, and calendars are projections unless explicitly promoted by a later product decision.

### EVIDENCE GAP

- Production reachability/authentication from any specific assistant provider is unproven by repository evidence.
- No live external assistant tool execution has been observed.
- Calendar projection field mapping/conflict semantics and user acceptance remain untested.
- The optimal first adapter transport is intentionally not selected before the provider-neutral contract exists.
- The correct application timezone source for date-only scheduling must be resolved from current user/account/runtime contracts during Phase 1 rather than guessed in this plan.
- The desired product meaning of “Remind me every Thursday…” must be fixed in an acceptance fixture: recurring task with reminder behavior versus a distinct recurring-reminder action. The phrase itself, not current parser precedence, decides the product question.

## Prioritized development gap: Assistant Action Contract v1

### Exact local owner/seam

The canonical owner should be a **shared task-domain application service extracted from the current `POST /api/tasks` workflow**, backed by existing storage primitives and shared schemas. `server/routes.ts` should become an adapter to that service; the assistant action executor should be another adapter/client of the same service. Do not make `server/storage`, `server/ai`, or a future MCP/plugin directory the complete business-rule owner.

Current task-create behavior that must be preserved while extracting the service includes:

- `insertTaskSchema` validation;
- task quota enforcement;
- duplicate fingerprint calculation/check/recording;
- canonical task creation;
- priority calculation and derived score/repetition metadata;
- classification, associations, and shopping detection;
- task update with derived fields;
- pattern learning;
- capped unique-task creation reward;
- the normal returned task/result data required by current callers.

The immediate structural debt to close is therefore:

- normal REST task creation owns domain logic inside a route registrar;
- AI task creation bypasses much of that logic and forces non-recurring persistence;
- `calendar-engine.ts` can resolve `reschedule_task`, but `use-voice.tsx` performs the mutation;
- `create_recurring_task` resolves to prefill rather than one canonical server mutation;
- calendar date-only resolution can cross a UTC/local date boundary;
- reschedule mutation is not covered by the same explicit review policy as the shared creation path;
- raw target utterances are not all classified as the intended action today;
- provider AI intent schemas cover a smaller command set than the shared parser.

The action contract should make those channels converge on one server-owned domain path and one explicit review/date-normalization policy.

### Raw-utterance acceptance contract

Phase 1 may not claim completion by injecting already-parsed intents. Its tests must start from these exact user-level phrases (plus deterministic fixture date/time/timezone and fixture tasks) and prove the agreed result through parsing, policy, action execution, and receipt:

1. `Schedule dentist Friday at 3.` → a scheduled AxTask task/action with the intended Friday and 3:00 time; it must not become a reminder solely because the text contains `at <number>`.
2. `Move the Northwell follow-up to Tuesday.` → resolve the intended existing task, produce an explicit reschedule review decision, and mutate only after that policy allows execution.
3. `Remind me every Thursday to refresh the PM ledger.` → preserve both the reminder intent and recurrence semantics according to one documented product rule; current recurrence-precedence behavior is not automatically accepted as correct.
4. `What do I have tomorrow?` → query tomorrow directly; the user must not be forced to say `on tomorrow` or `for tomorrow`.

If implementation evidence shows one phrase is inherently ambiguous, the passing behavior is a structured clarification—not silently choosing a different intent.

### Reference mechanisms to emulate

- Home Assistant: assistant tools wrap existing domain actions.
- Vikunja: rich parsing is upstream of normal task persistence.
- Taskwarrior: stable structured request/result boundary independent of UI.
- Vikunja MCP: tool publication is capability-aware.
- Nextcloud Tasks: recurrence/timezone/interoperability semantics deserve explicit contracts rather than implicit string/date conversion.

### Phase 1 supported behavior

Start with the smallest set that proves the seam:

- extract shared normal task creation service and keep current REST behavior compatible;
- create task through that shared service;
- create recurring task with recurrence persisted through canonical task rules;
- create reminder;
- reschedule task under an explicit mutation-review rule;
- read-only schedule/date query;
- exercise the four target raw utterances end to end.

The result must return canonical task/reminder IDs when applicable, normalized schedule fields, execution/review state, and structured clarification/failure information.

### Phase 1 local adaptations

- Reuse `shared/intent` parsing and execution policy rather than inventing a connector grammar; change their behavior only where raw-utterance acceptance proves the current contract wrong or incomplete.
- Extract the current normal task-create business workflow from `POST /api/tasks` into a reusable task-domain service; route the REST endpoint through it before claiming assistant creation parity.
- Make the assistant action executor call that domain service rather than `storage.createTask` directly.
- Extend or wrap the policy so **every mutation in the new action contract**, including reschedule, has an explicit `autoRun`/`review`/`block` outcome; default to review where the current contract is silent.
- Carry recurrence from the parsed command into canonical task creation instead of mapping recurring creation to a UI-only prefill or silently coercing it to `none`.
- Define date-only values independently from UTC instants, using the application/user timezone contract resolved from current source; add boundary fixtures around local midnight and DST transitions before claiming date normalization solved.
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

1. the four raw dictation utterances above pass from text through parser/classifier, policy, domain execution/query, and structured receipt or clarification;
2. `POST /api/tasks` and assistant task creation call the same extracted task-domain creation service and preserve the normal REST business effects listed above;
3. supported parsed commands map to one provider-neutral server action contract after raw-text classification;
4. create/reschedule/recurrence/reminder mutations use canonical domain persistence/business rules;
5. recurring-task creation persists the requested supported recurrence rather than falling back to prefill or `none`;
6. reschedule and every other mutation has an explicit review/authorization outcome, with ambiguous or policy-silent cases failing closed;
7. date-only normalization is deterministic in the configured application/user timezone and has regression fixtures around UTC/local midnight and DST boundaries;
8. ambiguous, blocked, or review-required input does not silently mutate;
9. structured action receipts expose canonical IDs/result state without provider-specific response types;
10. retries/idempotency have an explicit tested policy before an external adapter is allowed to mutate;
11. existing REST task-create, voice, AI, task, reward/classification, and relevant intent contracts remain green;
12. no auth, migration, scheduled-resource, or production deployment surface changed.

The proof ceiling is repository behavior only. It does not prove assistant-provider connectivity, production authentication, deployed runtime behavior, or user acceptance.

### Evidence that would invalidate this choice

Re-open the design if refreshed current `main` proves that:

- a provider-neutral server-side action executor already owns all of the above mutations;
- a reusable task-domain service already owns the complete normal `/api/tasks` creation workflow;
- a current canonical product contract deliberately makes an external calendar the operational source of truth;
- the task-domain module split materially changes the safe owner before implementation starts;
- the application intentionally models schedule dates only as UTC instants and has a separate proven user-facing date contract that invalidates the identified date-only seam;
- external assistant requirements cannot be met without first changing authentication, in which case Phase 1 must remain mutation-local and the auth sprint becomes the real external-access dependency.

## Review reconciliation

PR #157 review sharpened five claims before this plan became an execution dependency:

1. **Date normalization finding:** accepted. The earlier wording over-promoted date/time parsing into solved canonical date normalization. Phase 1 now owns a tested date-only/timezone rule and boundary fixtures.
2. **Recurring-task execution finding:** accepted. Parsing/model support is retained as solved baseline, but canonical server-side recurring creation is explicitly a Phase 1 gap.
3. **Reschedule review-policy finding:** accepted. Calendar reschedule currently travels outside the shared parsed-command creation policy, so Phase 1 must give every mutation an explicit execution-policy outcome and fail closed when policy is silent.
4. **Raw-utterance coverage finding:** accepted. Phase 1 cannot prove the goal from normalized intents alone; the four advertised sentences are now required end-to-end acceptance fixtures.
5. **Task business-rule owner finding:** accepted. `storage.createTask` is only a primitive; the current REST route owns important creation behavior. Phase 1 must extract that full workflow into a shared domain service and route both REST and assistant creation through it.

No code mutation is authorized by these findings in the reference-architecture sprint; they change the implementation acceptance contract.

## Successor phase map

### Phase 0 — Reference architecture and authority boundary

**Status:** this document.
**Artifact:** `docs/ASSISTANT_ACTION_REFERENCE_ARCHITECTURE.md`
**Gate:** external mechanisms and local gap are evidence-backed; continuity indexed by `AXQ-009`.

### Phase 1 — Assistant Action Contract v1

**Owner:** extracted shared task-domain service + provider-neutral action executor + `shared/intent` contracts.
**Artifacts:** shared task-create service, provider-neutral action/result types, server executor, raw-utterance fixtures, focused tests, compatibility wiring for existing channels as appropriate.
**Forbidden:** auth changes, production deploy, external calendar sync, MCP as domain owner.
**Gate:** proof criteria above pass, including REST/assistant task-create parity, target raw utterances, recurring persistence, explicit reschedule review policy, and timezone/date-only boundary tests.

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
**Action:** create the Phase 1 implementation sprint by reconciling the current raw utterance parser/classifier, execution policy, `POST /api/tasks` business workflow, `calendar-engine.ts`, provider AI tools, reminder/update services, application timezone/date contracts, and affected tests; first extract the full normal task-create workflow into a shared domain service, then implement the smallest provider-neutral server action executor covering create task, create recurring task, create reminder, reschedule task, and schedule query; wire raw-utterance fixtures through the entire path and run focused plus affected existing suites.
**Expected proof:** one merged shared task-domain creation service and server-owned action path with REST/assistant parity, deterministic receipts, target dictation fixtures, recurring persistence, explicit reschedule policy, timezone-safe date-only behavior, and no auth/calendar/production-surface changes.
**Completion gate:** all Phase 1 proof criteria above are satisfied on the exact integrated default-branch head.
