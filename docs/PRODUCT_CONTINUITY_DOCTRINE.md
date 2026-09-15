# AxTask Product Continuity Doctrine

**Status:** PROPOSED — tracked in PR #157 until merged
**Date:** 2026-09-15
**Evidence floor:** `main@7af06d7a9cf638dfe1c96a1e2b85914edb610f76`
**Related owners:** `docs/ASSISTANT_ACTION_REFERENCE_ARCHITECTURE.md`, PR #156 `docs/ACTIVITY_LEDGER_CONTRACT.md`

## Purpose

AxTask exists to reduce the friction of deciding, acting, and remembering. It should cooperate with calendars, assistants, task systems, ledgers, and other user surfaces rather than requiring the user to abandon them.

The product rule is **reciprocal continuity**:

> AxTask must remain useful when an external provider is unavailable, and the user's critical planning workflow must remain usable through another compatible surface when AxTask itself is unavailable.

This is a target product contract, not a claim that all reciprocal-continuity paths are implemented today.

## Doctrine

### 1. Reciprocal continuity, not one-way fallback

External systems such as Google Calendar may be better funded, more broadly integrated, or more convenient in a particular interface. AxTask should use those strengths when they lower user friction.

At the same time:

- an external provider must not become the only copy of AxTask's critical operational intent;
- AxTask must not become the only usable route to the user's critical commitments;
- configured interoperability should preserve enough portable state for work to continue during either side's outage, account change, pricing change, or replacement;
- reconnection must reconcile divergent state explicitly rather than silently overwrite one side.

Offline/export/sync behavior must be tested as continuity behavior, not treated as a marketing checkbox.

### 2. Cooperation before replacement

There is no product requirement to defeat Google Calendar, Outlook, Todoist, or another capable surface at its own mature specialty.

For each workflow, prefer the lowest-friction combination of AxTask and external systems. AxTask should internalize or deepen a workflow only when evidence shows that doing so materially improves at least one of:

- interactions or decisions required to complete useful work;
- outcome quality or correctness;
- recovery after interruption;
- explainability and provenance;
- continuity during provider or AxTask failure;
- retrospective recall;
- privacy or user control.

Feature parity for its own sake is not a development goal.

### 3. AxTask owns operational intent; adapters own transport

AxTask's canonical domain contracts own supported task/reminder/schedule intent and policy. Voice, LLM providers, REST clients, MCP/plugin clients, calendars, and other integrations are replaceable transports, peers, or projections unless an explicit contract states otherwise.

A provider-specific shortcut must not silently create a second business-rule path. New surfaces should reuse canonical AxTask domain actions where possible.

This ownership rule does **not** mean the user must interact only through AxTask. A peer surface may be the easiest place to view or edit a commitment when the interoperability contract supports it.

### 4. Remember is a first-class responsibility

AxTask must be designed to answer retrospective questions, not only prospective ones.

Target questions include:

- What did I do on this date?
- What did I work on during this week?
- What was I doing during this hour?
- What evidence do we have for what I was doing at a specific instant, such as 07:33 on a past date?

A strict question does not justify a fabricated answer. AxTask must preserve and expose the strongest available evidence and its limitations.

### 5. Planned time is not historical truth

AxTask must distinguish at least these evidence classes when they matter:

- **planned** — an intended future or scheduled activity;
- **declared** — a user/application assertion that work started, stopped, or occurred;
- **observed** — a source directly recorded activity at a time or interval;
- **inferred** — a derived conclusion from weaker or multiple sources;
- **completed outcome** — a durable completion event when the source can prove it.

A calendar event proves that time was scheduled; by itself it does not prove the work occurred. A mutable task date is not forensic completion evidence. When evidence conflicts or is absent, the answer must say so.

### 6. Preserve intervals and provenance when exact recall matters

Date-level aggregates are useful but insufficient for point-in-time recall. Sources capable of providing `startedAt`/`endedAt`, completion timestamps, or observed intervals should preserve those values rather than collapsing them prematurely into a single date.

Every historical answer should be reconstructable from identifiable source records. Source identity, temporal basis, confidence, and reconciliation decisions are part of the product contract.

### 7. Sync history is not automatically human activity history

Operational sync logs, mutation logs, and conflict metadata may be compacted or optimized for state recovery. They must not silently become the only source for long-lived user activity memory unless their retention and provenance contracts explicitly support that purpose.

Human-facing activity memory needs an intentional retention model of its own.

### 8. Passive observation is optional evidence, not mandatory surveillance

Automatic device/window/browser observation can strengthen point-in-time reconstruction, but it is privacy-sensitive and can be noisy.

If AxTask later consumes such sources:

- they are opt-in adapters;
- their evidence is typed as observed device context, not automatically as task completion;
- sensitive fields require minimization/redaction controls;
- explicit task/timer events and domain-ledger evidence should remain distinguishable from passive context.

### 9. Competition is measured in friction and outcomes

A workflow should move deeper into AxTask when AxTask can demonstrate a better result, not because a competitor implements it.

Useful benchmark dimensions include:

- decisions required before action;
- interactions required before action;
- time to resume after interruption;
- context lost during switching;
- ability to continue when one system is unavailable;
- ability to reconstruct past activity;
- ambiguity/error rate;
- provenance and confidence available to the user.

The benchmark should include AxTask, external peers, and hybrid AxTask+peer workflows. A hybrid workflow is allowed to win.

## Continuity acceptance scenarios

Future interoperability work should prove scenarios such as:

1. **Provider unavailable:** AxTask can still create/query its canonical tasks and reminders and can distinguish unsynced peer changes from confirmed peer state.
2. **AxTask unavailable:** previously synchronized/exported critical commitments remain usable in the configured peer surface to the extent supported by the adapter contract.
3. **Both changed while disconnected:** reconnection detects and reconciles divergent edits without silent destructive overwrite.
4. **Historical question:** a point-in-time query returns evidence-backed matching intervals or an explicit evidence gap; a scheduled calendar entry alone is not promoted to observed work.
5. **Provider replacement:** changing calendar/sync providers does not require rebuilding AxTask's canonical operational intent from scratch.

## Current proof boundary

As of the evidence floor above:

- PR #157 designs a provider-neutral assistant action owner but does not implement calendar synchronization or reciprocal failover.
- PR #156 designs `ledger/v1` and deterministic retrospective reporting, but it is unmerged and current native AxTask tasks do not expose immutable completion timestamps.
- No current repository evidence proves that AxTask can answer exact point-in-time historical questions from native activity intervals.

Those are development gaps, not exceptions to this doctrine.
