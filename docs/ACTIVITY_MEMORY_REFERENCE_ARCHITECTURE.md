# Activity Memory Reference Architecture

**Status:** PROPOSED PLAN — tracked in PR #157 until merged
**Date:** 2026-09-15
**Local evidence floor:** `main@7af06d7a9cf638dfe1c96a1e2b85914edb610f76`
**Activity-history lane inspected:** PR #156 `afb3f2d3c113ad2f50a0c8d31bcd22cf3747f42a`
**Continuity/action lane inspected:** PR #157 before this document `45bf785aec92d6b8a159c706ff9368e13661751e`
**Doctrine:** `docs/PRODUCT_CONTINUITY_DOCTRINE.md`

## Capability researched

Make AxTask's **remember** responsibility capable of answering both range questions and strict point-in-time questions without inventing history:

> What did I do that day or week?
>
> What was I doing during this hour?
>
> What evidence do we have for what I was doing at 07:33 on that date?

The researched slice is deliberately narrower than a general analytics redesign. It covers:

1. durable temporal evidence and exact intervals;
2. correlation between task state and tracked time;
3. provider-neutral/offline continuity;
4. standards-based calendar/task interoperability;
5. provenance/confidence when sources disagree.

This document does not authorize passive surveillance, Google Calendar sync, a database migration, or changes to PR #156 implementation ownership.

## Fresh AxTask floor

### OBSERVED_IMPLEMENTED

| Capability | Current evidence | Observation |
| --- | --- | --- |
| Domain-ledger identity and temporal evidence contract | PR #156 `docs/ACTIVITY_LEDGER_CONTRACT.md`, `shared/activity-ledger.ts` | `ledger/v1` separates stable source identity from mutable content and defines temporal basis/confidence. |
| Deterministic range reporting | PR #156 `shared/activity-report.ts`, `client/src/components/activity-brief.tsx` | Inclusive date-range aggregation, cadence/focus/highlights, private/showcase modes. |
| Stronger external timestamps supported by contract | PR #156 `ledger/v1` | `completedAt`, `occurredAt`, `startedAt`, `endedAt`, `dueAt` are represented by the producer contract. |
| Provider-neutral action direction | PR #157 `docs/ASSISTANT_ACTION_REFERENCE_ARCHITECTURE.md` | Voice/LLM/MCP/calendar surfaces are adapters around canonical AxTask actions rather than new domain owners. |
| Calendar/task planning surface | Current application plus PR #155/#157 evidence | AxTask already has task/calendar UI and scheduling language; this is prospective planning, not forensic activity evidence. |

### DOCUMENTED / IMPLEMENTED BUT NOT YET INTEGRATED

PR #156 is open, not merged. Its current documentation explicitly states that native AxTask tasks lack an immutable completion timestamp and therefore use a weaker `task-date` / `declared` basis for retrospective reports.

The PR also has unresolved review findings around temporal validation, task-date projection semantics, identity normalization, deterministic sorting, query loading/error state, and analytics ownership scope. Until those are repaired and the exact head is validated/merged, `ledger/v1` and Activity Brief are implementation evidence on the feature branch, not mainline capability.

### ABSENT IN THE INSPECTED FLOOR

- A native immutable task lifecycle event/interval history sufficient to prove exact historical work periods.
- A point-in-time query contract such as `activityAt(instant)` that returns all evidence spans containing an instant.
- A canonical reconciliation policy for overlapping planned, declared, observed, and inferred sources.
- Reciprocal calendar/AxTask continuity implementation; the doctrine is a target and PR #157 explicitly excludes calendar sync from Phase 1.
- A privacy-scoped adapter for passive device/window/browser context.

## Bounded external reference set

The reference set is intentionally small and mechanistically diverse. None is selected because of stars or marketing claims.

| Reference / evidence identity | Purpose relevant here | License | Why it belongs |
| --- | --- | --- | --- |
| `ActivityWatch/aw-server-rust@9a78451ec2cfd6030ab378f888da144cc7788274` + `ActivityWatch/aw-watcher-window@a82b6d13c9fc7c87fb3020184e85676d5ccf70f0` | Local timestamped activity capture, buckets, heartbeat-to-interval behavior, querying/import/export | MPL-2.0 for `aw-server-rust` | Demonstrates how independent observers can feed a generic temporal event store capable of reconstructing a point in time. |
| `GothenburgBitFactory/timewarrior@41f3880ee73bb528419a51d7f97b6f53ec983338` | Explicit stopwatch intervals, Taskwarrior hook, JSON interval import/export | MIT | Demonstrates a thin task-state-to-time-interval seam without making the task manager and time tracker the same subsystem. |
| `super-productivity/super-productivity@23fcdae6195f4742086d7a6099cf69c0079da283` | Local-first task/time state, operation log, snapshots, provider-neutral sync/backups, worklog | MIT | Demonstrates user-owned local state plus multiple provider transports and explicit offline/conflict recovery; also demonstrates why a sync log is not automatically a permanent audit log. |
| `go-vikunja/vikunja@d2a5b7693d0513e6de1cc2ab7f0930e841e4e936` | Task manager with CalDAV/VTODO interoperability, ETags, client compatibility tests | AGPL-3.0-or-later | Demonstrates standards-based peer interoperability and the semantic edge cases that must be tested across clients. |

## Reference mechanisms

### ActivityWatch — observer -> bucket -> timestamped event -> interval

**OBSERVED_IMPLEMENTED**

Relevant source surfaces:

- `aw-server-rust/aw-models/src/event.rs`: an `Event` has an RFC3339 UTC start timestamp, duration, and data.
- `aw-watcher-window/aw_watcher_window/main.py`: creates a host-specific `currentwindow` bucket, polls active window state, creates UTC events, and sends queued heartbeats.
- `aw-server-rust/aw-transform/src/heartbeat.rs`: repeated heartbeats with equivalent data can be merged into a longer event span.
- `aw-server-rust/aw-server/src/endpoints/import.rs`: imported events are deduplicated using timestamp/duration/data.
- `aw-server-rust/aw-datastore/src/privacy_filter.rs`: privacy filtering exists as a distinct concern.

**Mechanism:** capture sources do not own the historical query model. They emit timestamped observations into source-separated buckets; heartbeats compact repeated observations into intervals; the datastore/query layer can later answer which observations overlap a time range.

**Failure/recovery behavior:** watcher polling tolerates non-fatal observation errors and skips unavailable samples; fatal watcher errors stop the process. Heartbeat pulsetime is deliberately widened relative to polling to avoid false gaps from scheduler jitter.

**AxTask disposition: ADAPT.** Preserve source-separated timestamped intervals and explicit gaps. Do not copy mandatory active-window surveillance into AxTask. If an ActivityWatch-like adapter is ever added, type it as `observed-device-context`, make it opt-in, and keep it distinct from proof that a human completed a task.

### Timewarrior — task lifecycle edge -> explicit interval

**OBSERVED_IMPLEMENTED**

Relevant source surfaces:

- `ext/on-modify.timewarrior`: reads old/new Taskwarrior JSON, maps start transitions to `timew start`, stop/end transitions to `timew stop`, and carries task description/project/tags into the interval.
- `doc/man1/timew-export.1.adoc`: exports selected intervals as JSON containing start, end, id, tags, and annotation.
- `doc/man1/timew-import.1.adoc`: consumes the same interval-object shape for import.

**Mechanism:** a very thin hook translates task lifecycle changes into a dedicated time-tracking subsystem. Task identity/context is carried as correlation metadata while the time tracker owns exact intervals.

**AxTask disposition: ADOPT principle / ADAPT implementation.** Native AxTask task start/stop/completion actions should emit immutable temporal evidence through the canonical task-domain action owner. AxTask does not need a subprocess hook, but it should retain the architectural separation between task intent and historical interval evidence.

### Super Productivity — local canonical state -> bounded operation log -> provider adapters

**OBSERVED_IMPLEMENTED**

Relevant source surfaces:

- `docs/sync-and-op-log/operation-log-architecture.md`: local state transitions are captured into a durable bounded operation log; startup uses snapshot + replay; file providers and SuperSync feed the same client operation-log pipeline; vector clocks and deterministic conflict handling support offline concurrent edits.
- `src/app/op-log/sync/*`: provider I/O, remote operation processing, conflict handling, and tests are separated from domain state.
- `docs/wiki/3.06-User-Data.md`: backup/export covers application model including tasks, time-tracking state, reminders, planner data, and provider settings.
- worklog/task models preserve tracked duration by day and export worklog data.

**Mechanism:** keep operational state locally recoverable and route multiple providers through a common sync boundary instead of teaching every feature about every provider.

**Important negative precedent:** the project's own architecture document says its operation log is bounded and compacted. Rejected/covered rows are not permanent audit history.

**AxTask disposition: ADAPT** local/provider-neutral continuity and explicit conflict semantics. **REJECT** using a bounded sync/operation log as AxTask's sole long-term human activity memory.

### Vikunja — canonical tasks <-> standards adapter with revision and compatibility proof

**OBSERVED_IMPLEMENTED**

Relevant source surfaces:

- `pkg/routes/caldav/sync_collection.go`: exposes task resources with ETags derived from task identity/update state.
- `pkg/caldav/caldav.go`: maps tasks to VTODO and contains explicit semantics around completion/repeating tasks to prevent clients from echoing a stale state back as a new completion.
- `pkg/routes/caldav/listStorageProvider.go`: parses VTODO resource mutations through the application's storage/session boundary and rolls back failures.
- `pkg/caldavtests/sync_test.go` and `client_compat_test.go`: exercise ETag changes and real client compatibility/resynchronization behavior.

**Mechanism:** use a standards-facing adapter with explicit revision semantics and compatibility fixtures; do not let the interchange representation silently redefine domain semantics.

**AxTask disposition: ADOPT/ADAPT** for future calendar/task peer interoperability. CalDAV/VTODO is not itself an activity-memory source and must not be treated as proof that scheduled work occurred.

## Pattern disposition ledger

| Pattern | Disposition | AxTask consequence |
| --- | --- | --- |
| Source-separated timestamped observations and intervals | ADOPT/ADAPT | Preserve source, start/end, provenance, and gaps in the historical model. |
| Thin task lifecycle -> time interval bridge | ADOPT | Canonical AxTask task actions should produce historical lifecycle evidence without duplicating task business rules. |
| Local canonical state with replaceable provider adapters | ADAPT | Supports reciprocal continuity and provider replacement. |
| Explicit revision/conflict semantics across peer systems | ADOPT/ADAPT | Bidirectional sync must detect divergent edits rather than silently overwrite. |
| Compatibility tests against real peer clients | ADOPT | Calendar/task adapters need semantic round-trip fixtures, not only API unit tests. |
| Bounded sync op-log as permanent user audit/history | REJECT | Sync recovery and long-lived human memory have different retention contracts. |
| Calendar appointment as proof of performed work | REJECT | A planned interval remains planned unless another source supplies stronger evidence. |
| Mutable task date/status as forensic timestamp | REJECT | Current PR #156 correctly labels native task projection as declared, not observed. |
| Mandatory active-window/browser surveillance | REJECT | Passive evidence can be a future opt-in adapter only. |
| Silent single-source winner when observations overlap | REJECT | Preserve candidates and evidence strength; do not fabricate certainty. |

## Solved baseline vs prioritized gap

### ALREADY_SOLVED_INTERNALLY

- Natural-language task/reminder/schedule parsing and deterministic action policy on current main / PR #157's inspected floor.
- Domain-ledger identity, temporal basis/confidence, and deterministic range-reporting implementation on PR #156, subject to its unresolved reviews and merge gate.
- Existing prospective task/calendar UI and task persistence.

### AVAILABLE_TO_EMULATE_EXTERNALLY

- ActivityWatch's event/interval model and source-separated observers for point-in-time reconstruction.
- Timewarrior's explicit task lifecycle -> interval correlation and portable interval export.
- Super Productivity's provider-neutral/offline continuity boundary and explicit conflict/recovery semantics.
- Vikunja's CalDAV/VTODO revision semantics and client-compatibility tests.

### PROJECT_SPECIFIC_GAP

AxTask lacks an **Activity Memory Timeline** that combines its existing provenance/confidence ideas with exact intervals and can answer a point-in-time question without conflating plan with observation.

The local gap is not “build ActivityWatch inside AxTask.” It is:

1. preserve native task lifecycle timestamps/intervals as historical evidence;
2. accept external interval-capable sources without making them domain authorities;
3. query all records that contain a specific instant or overlap a range;
4. rank/display evidence strength without silently choosing a false winner;
5. reconcile planned calendar state with observed/declared history;
6. later persist that memory with an intentional retention/privacy policy.

### EVIDENCE GAP

- No local checkout/runtime is available in this execution environment, so repository validators cannot be run here.
- PR #156 has unresolved review findings and is not merged; its exact temporal contract is therefore not yet a stable mainline dependency.
- No live Google/AxTask bidirectional synchronization or outage behavior has been observed.
- Search did not find an existing native AxTask immutable lifecycle-event owner. If one exists outside the inspected surfaces, this plan must be re-evaluated before schema work.

## Prioritized development gap

### Target: Activity Memory Timeline v1 — interval semantics and exact-time query contract

Do **not** start by creating a new database table or a passive watcher.

The smallest high-leverage successor is a deterministic shared contract/query slice on top of the activity model after PR #156 is repaired and merged:

**Local owner/seam**

- existing activity-history owner: `shared/activity-ledger.ts` and `docs/ACTIVITY_LEDGER_CONTRACT.md` from PR #156;
- new focused query owner: a small shared activity-memory module following repository conventions, rather than calendar UI or provider code;
- focused tests adjacent to the shared contract.

**Reference mechanisms to emulate**

- ActivityWatch: timestamp + duration/start/end and explicit source separation;
- Timewarrior: task lifecycle transitions produce exact intervals;
- Super Productivity: adapters do not become domain owners;
- Vikunja: peer revisions and semantic compatibility tests when calendar sync is later added.

**Required local adaptations**

- preserve `startedAt` and `endedAt` as an interval instead of reducing every record to one report anchor;
- define interval boundary semantics explicitly (recommended: half-open `[start, end)` to avoid double-membership at adjacent boundaries);
- return every evidence record containing the requested instant, not an invented single winner;
- carry source identity, temporal basis, confidence, and visibility into the query result;
- keep planned calendar entries distinguishable from declared/observed intervals;
- normalize offset-bearing instants deterministically and test DST/local-date edges;
- represent an evidence gap as a first-class result.

**Non-goals for v1**

- no passive active-window/browser tracker;
- no Google Calendar/CalDAV sync;
- no machine-learning inference about what the user “probably” did;
- no database migration;
- no new scheduler;
- no use of sync/CI logs as the historical source of truth;
- no mutation of PR #156 while it remains independently owned.

**Acceptance/proof fixtures**

1. `07:33` inside one observed interval returns that source and interval.
2. An instant exactly at an interval end follows the documented boundary rule.
3. Overlapping declared and observed records return both with evidence typing; the query does not erase either.
4. A planned calendar-style record overlapping an observed task interval remains planned and cannot be presented as proof of performed work.
5. A time with no qualifying evidence returns an explicit gap rather than the nearest task as fact.
6. Equivalent offset-bearing instants resolve identically; DST transition fixtures do not shift the query into the wrong local day.
7. Private evidence remains available only in the private/query surface permitted by the surrounding privacy contract; showcase output does not gain new leakage.
8. Deterministic ordering is environment-independent when evidence strengths and timestamps tie.

**Evidence that would invalidate or reshape this target**

- current main already contains an immutable native task lifecycle event store not found in the inspected surfaces;
- PR #156's repaired contract chooses materially different interval/provenance ownership;
- repository data-state rules identify an existing canonical event model that should own the query instead of a new shared module.

## Successor map

### Phase A — stabilize the existing history floor

Owner: PR #156.

Repair its still-valid review findings, run its targeted and broad validation, rebase/reconcile with refreshed main, and merge only when its exact head is green and review-clean. This phase is a prerequisite because exact-time work should extend a stable activity contract rather than fork it.

### Phase B — exact-time query contract, no persistence

Add interval-preserving normalization and point-in-time query semantics with the acceptance fixtures above. This proves the question model before taking on schema/retention risk.

### Phase C — native lifecycle evidence

Route canonical task-domain start/stop/completion transitions into immutable activity evidence. This phase must reuse the task-domain action owner established by the assistant-action work rather than create another task mutation path.

### Phase D — durable persistence and retention

Only after the event/interval contract is stable, choose a persistent owner. If a new append-only table is required, `AGENT_GUARDRAILS.md` requires retention policy and cleanup coverage in the same PR. Add idempotent ingestion, source hashes/revisions, deletion/tombstone policy, privacy controls, and migration/rollback proof.

### Phase E — interoperable peer adapters

Add calendar/task peers through provider-neutral adapters. Prove reciprocal outage/reconnect behavior and semantic compatibility. External calendar state remains useful during AxTask outage where the configured adapter can support it; AxTask remains useful during provider outage from its own canonical state.

### Phase F — optional passive context

Only if user value justifies the privacy cost, add opt-in ActivityWatch-like device-context adapters. Their output remains observed context, never automatic completion truth.

## Next executable action

**Owner:** PR #156 activity-history lane before any new exact-time implementation.

**Dependency:** PR #156 review reconciliation and refreshed-main compatibility.

**Action:** validate every current unresolved PR #156 review finding against its exact head; repair all still-valid temporal/data-integrity/query-state defects; run `npx vitest run shared/activity-ledger-report.test.ts`, `npm run check`, `npm test`, and `npm run build`; refresh main and the PR head; then merge only if required checks/reviews are satisfied.

**Expected proof:** PR #156 merged into refreshed `main` with the activity contract and report tests green. Only then should Phase B create the exact-time interval-query slice.

## Proof ceiling

This document proves a repository-grounded reference architecture and a narrowed successor target. It does **not** prove PR #156 repair/merge, exact-time querying, native lifecycle capture, persistence, Google/CalDAV interoperability, outage failover, deployment, or live user acceptance.
