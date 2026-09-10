# Activity Ledger Contract and Retrospective Reports

Status: ACTIVE
Contract: `ledger/v1`
Owner surfaces: `shared/activity-ledger.ts`, `shared/activity-report.ts`, `client/src/components/activity-brief.tsx`

## Product boundary

**Domain ledgers own what happened and why. AxTask owns the temporal projection of that truth.**

AxTask must not become the authoritative database for every external domain. A client ledger, project ledger, deployment ledger, research ledger, or Prompt Kit-generated ledger stays authoritative for its domain. AxTask consumes a stable activity contract so the same source history can be searched, visualized, summarized, and presented over time.

The target question is deliberately simple:

> What did my activity look like between January and May?

The answer must be reproducible from bounded source records. Natural-language routing may eventually translate that sentence to `{ from, to }`, but the report engine itself does not infer missing history or invent dates.

## Deterministic producer identity

A `ledger/v1` record has three immutable identity inputs:

- `sourceSystem`
- `sourceLedger`
- `entryId`

`buildActivityKey()` canonicalizes exactly that tuple. Mutable prose, status, dates, descriptions, classifications, and evidence are **not** part of identity. Reprocessing the same ledger entry therefore targets the same logical activity even after its content changes.

A persistence adapter may hash the canonical key for storage, but changing the tuple semantics would be a contract change.

## `ledger/v1` producer shape

Required fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Literal `ledger/v1` |
| `entryId` | Stable row/record identity inside the source ledger |
| `sourceSystem` | Producer/storage identity such as `drive`, `repo-ledger`, or another adapter name |
| `sourceLedger` | Stable ledger identity, not a display title that changes casually |
| `title` | Human-readable activity title |
| `status` | `planned`, `in-progress`, `completed`, `cancelled`, or `observed` |
| `createdAt` | ISO source-record creation date/datetime |
| `updatedAt` | ISO source-record update date/datetime |

Optional temporal fields strengthen retrospective truth:

- `occurredAt`
- `startedAt`
- `endedAt`
- `dueAt`
- `completedAt`

Temporal values must be a real ISO calendar date (`YYYY-MM-DD`) or an ISO datetime with an explicit `Z`/UTC offset. Timezone-less datetimes are rejected so two consumers cannot silently interpret the same ledger row differently.

Optional domain/provenance fields include `description`, `project`, `activityType`, `classification`, `sourceUrl`, `visibility`, and bounded evidence references.

Example:

```json
{
  "schemaVersion": "ledger/v1",
  "entryId": "dbsmith-2026-09-10-turnstile",
  "sourceSystem": "drive",
  "sourceLedger": "db-smith-project-ledger",
  "title": "Complete Turnstile contact-form validation",
  "status": "completed",
  "createdAt": "2026-09-10T08:42:00-04:00",
  "updatedAt": "2026-09-10T11:18:00-04:00",
  "completedAt": "2026-09-10T11:18:00-04:00",
  "project": "DB Smith Website",
  "activityType": "implementation",
  "classification": "Client Delivery",
  "visibility": "private",
  "evidence": [
    { "ref": "ledger-row:turnstile-production-proof" }
  ]
}
```

## Temporal basis and confidence

Every normalized activity carries both a basis and confidence level. This prevents a scheduled date from silently becoming proof that work actually happened then.

Strongest-to-weakest ledger anchors are:

1. `completedAt` → observed
2. `occurredAt` → observed
3. `startedAt` → declared
4. `dueAt` → declared
5. `updatedAt` → recorded
6. `createdAt` → recorded

Current AxTask tasks are a compatibility source. They project from `startDate`, or otherwise the task's `date`/`time`, with basis `task-date` and confidence `declared`. AxTask currently does not store an immutable task completion timestamp, so retrospective reports must not describe those task dates as forensic completion times.

When source ledgers begin supplying `completedAt` or `occurredAt`, the same report engine gains stronger historical evidence without changing the report contract.

## Retrospective report contract

`buildActivityReport()` accepts normalized activities plus an inclusive valid `YYYY-MM-DD` calendar range. It deterministically returns:

- total activities;
- completed, in-progress, planned, observed, and cancelled counts;
- completion rate;
- active-day count;
- monthly cadence;
- focus areas/classifications;
- temporal-confidence distribution;
- bounded completed highlights.

Input order does not control report ordering. Month groups, classifications, and highlights use explicit deterministic sort rules.

A reversed, malformed, or impossible date range fails closed. The report engine does not silently reinterpret the user's question.

## Showcase privacy contract

Two report modes exist:

- `private`: authenticated on-screen analysis may show completed task titles and classification labels.
- `showcase`: aggregate totals/cadence include all matching activities, but detailed completed titles are emitted only from activities marked `public`; classification labels from private activities collapse into the neutral `Private work` bucket.

Showcase HTML never exports task notes or evidence payloads. Private completed titles withheld from the showcase are counted so the report can explain why its detail list may be shorter than the aggregate completion count.

This makes a brief suitable for a PM/director/client conversation without treating every private ledger detail or custom classification name as presentation-safe.

## Prompt Kit producer guidance

A Prompt Kit ledger-creation prompt should produce durable domain truth first and `ledger/v1` compatibility second. Do not force an AxTask-specific spreadsheet layout when the domain needs richer information.

Producer rules:

1. Generate and preserve a stable `entryId` for every durable row.
2. Preserve source-ledger identity across edits and exports.
3. Emit real ISO dates or offset-bearing ISO datetimes rather than ambiguous phrases such as `this morning`.
4. Prefer observed `completedAt` / `occurredAt` evidence when the source can prove it.
5. Keep mutable prose out of deterministic identity.
6. Default `visibility` to `private`; public showcase detail must be intentional.
7. Keep evidence as references/links rather than copying large artifacts into AxTask.

A user who creates a compliant ledger should be able to adopt AxTask later without restructuring months of history.

## Current implementation and next boundary

The current Analytics `Activity Brief` proves the retrospective report and showcase-rendering contract against existing AxTask tasks. It does **not** yet persist external `ledger/v1` records. The next ingestion sprint should add an idempotent adapter/upsert boundary that uses the canonical activity key, preserves provenance, and records source hashes/change state without changing the producer contract defined here.

Do not add persistence by overloading `tasks` with opaque external metadata unless that design is separately reviewed against the data-state domain and migration safety contract.
