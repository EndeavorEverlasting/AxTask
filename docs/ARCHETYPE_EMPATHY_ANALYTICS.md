# Archetype empathy analytics

This document covers the archetype-level analytics layer that sits on top of
the existing feedback-with-avatars pipeline. It is the single reference for
the privacy model, event taxonomy, empathy scoring, Markov transitions, and
the read contract that RAG / predictive modules consume.

No new event pipeline was introduced: every archetype signal originates from
the same avatar nudge flow users already see, stamped with a hashed actor and
archetype key instead of a user id.

## Goals

1. Analyze **archetypes**, never individual users.
2. Produce a scalar **empathy score** per archetype per day.
3. Produce first-order **Markov transition probabilities** between archetypes
   so downstream predictive modules can model user journeys without ever
   touching user ids.
4. Expose a stable read contract that RAG services can consume without
   re-implementing aggregation or privacy logic.

## Privacy model

Every archetype-signal event row stores a salted hash of the user id, never
the raw id:

```
hashedActor = HMAC-SHA256(ARCHETYPE_ANALYTICS_SALT, userId)
```

Implementation: [server/lib/actor-hash.ts](../server/lib/actor-hash.ts).

- **Fail-closed in production.** If `ARCHETYPE_ANALYTICS_SALT` is missing or
  shorter than 16 chars in production, `hashActor()` throws. Feedback ingest
  swallows the error so the user flow never breaks, but no signal is
  recorded.
- **Non-reversible.** Hashes cannot be mapped back to user ids without the
  salt. Sequences per `hashedActor` are used transiently by the rollup
  worker to build Markov counts; the hash is **never** written to the rollup
  tables.
- **No user column on rollup tables.** Neither
  `archetype_rollup_daily` nor `archetype_markov_daily` has a `user_id`,
  `actor_user_id`, or `hashed_actor` column. The privacy contract test in
  [server/archetype-privacy.contract.test.ts](../server/archetype-privacy.contract.test.ts)
  fails loudly if that invariant ever regresses.
- **No raw source strings.** Raw free-form `source` values (e.g.
  `avatar_skill_unlock_entourage_slots`) are collapsed to a coarse
  `sourceCategory` (e.g. `skill_unlock`) before being written. See
  `categorizeSource` in
  [server/lib/archetype-signal.ts](../server/lib/archetype-signal.ts).
- **k-anonymity guard.** Read APIs drop any archetype/day row with
  `samples < 5` even though the aggregation itself is already archetype-
  level. Belt and suspenders.
- **Access control.** Read APIs require either an admin session or a scoped
  token via the `X-AxTask-Archetype-Token` header (env
  `ARCHETYPE_READ_TOKEN`). Without either the API returns 401/503.

## Event taxonomy

All archetype signals land in the tamper-evident `security_events` ledger
with `event_type = 'archetype_signal'`. The ledger's `actor_user_id` is
**deliberately left NULL**; the hash lives in the JSON payload only.

| Signal              | Emitted from                                                 |
| ------------------- | ------------------------------------------------------------ |
| `nudge_shown`       | `FeedbackNudgeDialog` mount (per avatar event)               |
| `nudge_dismissed`   | Dialog dismissed via "Not now" or outside-click              |
| `nudge_opened`      | "Open feedback" button click                                 |
| `feedback_submitted`| Successful `POST /api/feedback` with `nudgeContext`          |

Payload shape (per row):

```json
{
  "archetypeKey": "momentum | strategy | execution | collaboration | recovery",
  "hashedActor": "<base64url HMAC-SHA256>",
  "signal": "nudge_shown | nudge_dismissed | nudge_opened | feedback_submitted",
  "insightful": "up" | "down" | null,
  "sentiment": "positive" | "neutral" | "negative" | null,
  "sourceCategory": "skill_unlock | skill_branch | skill_tree | task | classification | community | rewards | bulk | dashboard | recalibration | other | unknown"
}
```

The micro-control (Insightful / Felt off) lives inline in the nudge dialog
and in the `/feedback` submit payload as the `insightful` field.

## Empathy score

See [server/engines/archetype-empathy-engine.ts](../server/engines/archetype-empathy-engine.ts).

For each archetype per bucket (default bucket: UTC day), we compute four
sub-rates and combine them as a weighted average clamped to `[0, 1]`:

| Sub-rate              | Definition                                           | Weight |
| --------------------- | ---------------------------------------------------- | ------ |
| `openRate`            | `opened / shown`                                     | 0.25   |
| `conversionRate`      | `submitted / max(opened, 1)`                         | 0.25   |
| `explicitInsightRate` | `(insightfulUp - insightfulDown) / shown`, rescaled `[-1,1] -> [0,1]` | 0.30 |
| `sentimentRate`       | `(positive - negative) / submissions`, rescaled `[-1,1] -> [0,1]`     | 0.20 |

```
empathyScore = clamp01(
    0.25 * openRate
  + 0.25 * conversionRate
  + 0.30 * explicitInsightRate
  + 0.20 * sentimentRate
)
```

Weights are documented inline in the engine as `EMPATHY_WEIGHTS` so future
tuning is always in one place.

Sample tests (bounds, monotonicity with respect to explicit insight, rescue
when insightful-down outnumbers insightful-up) live in
[server/engines/archetype-empathy-engine.test.ts](../server/engines/archetype-empathy-engine.test.ts).

## Markov transitions

Per-hashedActor sequences of archetype keys are ordered by event time and
converted to first-order transition pair counts
(`from -> to`). Self-transitions are included.

The counts are written daily to `archetype_markov_daily`. Probability
matrices are derived at read time by row-normalizing counts:
`P(to | from) = count(from -> to) / sum_to(count(from -> to))`.

## Rollup worker

See [server/workers/archetype-rollup.ts](../server/workers/archetype-rollup.ts).

- Ticks every `ARCHETYPE_ROLLUP_INTERVAL_MS` (default 1h) from
  [server/index.ts](../server/index.ts).
- Each tick rolls up today-so-far **and** yesterday so the latest figures
  are always fresh.
- Rollup is idempotent: for each bucket date it deletes existing rows and
  re-inserts. Safe to re-run.
- Archetypes with zero activity for a day get no row (keeps the table
  clean; read APIs treat missing rows as "insufficient samples").
- Disabled automatically under `NODE_ENV=test` or
  `DISABLE_ARCHETYPE_ROLLUP=true`.

## RAG / predictive read contract

All reads are archetype-keyed, aggregated, and subject to the k-anonymity
guard.

### `GET /api/archetypes/empathy?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returns daily empathy scores per archetype over a window of up to 180 days.

Response:

```json
{
  "from": "2026-04-01",
  "to": "2026-04-18",
  "kAnonymityThreshold": 5,
  "series": [
    {
      "archetypeKey": "momentum",
      "series": [
        { "date": "2026-04-03", "empathyScore": 0.6421, "samples": 17 }
      ]
    }
  ]
}
```

### `GET /api/archetypes/markov?window=30d`

Returns the aggregated transition matrix over the last N days (max 180).

Response:

```json
{
  "window": "30d",
  "from": "2026-03-20",
  "to": "2026-04-18",
  "kAnonymityThreshold": 5,
  "transitions": [
    { "from": "momentum", "to": "strategy", "probability": 0.4167, "samples": 23 }
  ]
}
```

### Authentication

Pass either:

- An authenticated admin session cookie, **or**
- The shared `ARCHETYPE_READ_TOKEN` via `X-AxTask-Archetype-Token`.

Missing token in a non-admin context returns 401; missing server
configuration returns 503.

## Environment variables

| Variable                        | Required | Purpose                                                     |
| ------------------------------- | -------- | ----------------------------------------------------------- |
| `ARCHETYPE_ANALYTICS_SALT`      | prod     | HMAC salt for `hashActor`. Fails closed in prod if missing. |
| `ARCHETYPE_READ_TOKEN`          | optional | Scoped token that grants read access without admin session. |
| `ARCHETYPE_ROLLUP_INTERVAL_MS`  | optional | Worker tick interval. Default `3600000` (1h).               |
| `DISABLE_ARCHETYPE_ROLLUP`      | optional | Set to `true` to disable the background ticker.             |

Generate values with:

```sh
# Salt (64 hex chars, >=16 required, >=32 recommended)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Read token (43-char URL-safe base64url)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Local dev: both are optional. When `ARCHETYPE_ANALYTICS_SALT` is unset,
`hashActor()` falls back to a `SESSION_SECRET`-derived key so hashes remain
stable across restarts without any new setup. See
[.env.example](../.env.example) and [.env.production.example](../.env.production.example)
for the committable stanzas.

### Deferred env promotions

The following are currently hard-coded constants in
[server/routes.ts](../server/routes.ts) and are **planned for promotion to
env vars in a later sprint**, with the current values kept as safe defaults:

| Constant                      | Current | Planned env var                   | Why deferred                                                                                   |
| ----------------------------- | ------- | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ARCHETYPE_K_ANON_THRESHOLD`  | `5`     | `ARCHETYPE_K_ANON_THRESHOLD`      | 5 is a conservative privacy floor; raising it requires more signal volume to be operational.  |
| `ARCHETYPE_MAX_WINDOW_DAYS`   | `180`   | `ARCHETYPE_MAX_WINDOW_DAYS`       | 180d matches the current read-API contract; any change must be coordinated with RAG consumers. |

No operator need to override these values is expected before RAG consumers
come online, so the promotion is intentionally deferred to avoid churn on
the read contract.

## JSON payload versioning & compatibility

The archetype pipeline is deliberately resilient to schema drift, rolling
deploys, and user-tweaked JSON. This matters because `db:push`, migration
re-runs, and even well-intentioned edits to shared JSON contracts can all
produce payload shapes the rollup worker needs to handle gracefully.

### Wire format (v1)

Every new `archetype_signal` row written by `recordArchetypeSignal` stamps
both `v` and `schemaVersion` (matching the convention already used by
[server/account-backup.ts](../server/account-backup.ts) and
[server/migration/export.ts](../server/migration/export.ts)):

```json
{
  "v": 1,
  "schemaVersion": 1,
  "archetypeKey": "…",
  "hashedActor": "…",
  "signal": "…",
  "insightful": null,
  "sentiment": null,
  "sourceCategory": "…"
}
```

### Evolution rules

1. **New fields MUST be optional.** Additive-only inside a major version.
2. **Fields MUST NOT be removed** inside a major version. Mark as deprecated
   in docs, keep writing for one release, then bump `v`.
3. **`v` is bumped only on a breaking change** (field removal or semantics
   change). Additive edits stay `v: 1`.
4. **Unknown fields are preserved by the parser.** `catchall(z.unknown())`
   in [server/lib/archetype-signal-payload.ts](../server/lib/archetype-signal-payload.ts)
   makes v2+ payloads parse cleanly as long as the v1 required shape is
   still present.

### Parser fallback behavior

The tolerant parser in
[server/lib/archetype-signal-payload.ts](../server/lib/archetype-signal-payload.ts)
accepts:

- Legacy rows with no `v` / `schemaVersion` (version reported as `0`).
- Current v1 rows.
- v2+ rows whose shape is still compatible with the v1 required fields.

The rollup worker tracks two separate observability counters per tick:

- `skippedMalformed` — rows that failed the tolerant parse entirely
  (invalid JSON, missing `archetypeKey`, unknown archetype/signal, etc.).
- `skippedFutureVersion` — rows parsed successfully but carrying
  `v > ARCHETYPE_SIGNAL_PAYLOAD_VERSION`. These are **still aggregated**
  (forward-compat) but a sudden spike is a signal that a rolling deploy is
  in progress.

### Schema / migration stability

- The Drizzle model in [shared/schema.ts](../shared/schema.ts) and the
  migration in
  [migrations/0019_archetype_empathy_analytics.sql](../migrations/0019_archetype_empathy_analytics.sql)
  must declare the same column set. The parity is enforced by
  [server/schema-stability.contract.test.ts](../server/schema-stability.contract.test.ts)
  so a rename in one file without the other fails CI.
- `db:push` is safe on the archetype tables because they are
  additive-only; destructive edits (renames, drops) must go through a
  dedicated `migrations/*.sql` file per
  [docs/DEV_DATABASE_AND_SCHEMA.md](DEV_DATABASE_AND_SCHEMA.md).
- Migration idempotency (re-runs of
  [scripts/apply-migrations.mjs](../scripts/apply-migrations.mjs) after a
  filename change) is enforced by the same contract test: every
  `CREATE TABLE` / `CREATE INDEX` must use `IF NOT EXISTS`.

### User-facing JSON export/import

Account export and admin migration bundles do **not** carry archetype rows
(confirmed via [server/account-backup.ts](../server/account-backup.ts) and
[server/migration/export.ts](../server/migration/export.ts)). Archetype
analytics are archetype-keyed, never user-keyed — there is nothing to move
with a per-user bundle. When users tweak imported JSON, the archetype
pipeline is not affected.

## Database objects

- `archetype_rollup_daily (archetype_key, bucket_date, empathy_score, samples, signals_json)`
- `archetype_markov_daily (from_archetype, to_archetype, bucket_date, count)`
- Migration: [migrations/0019_archetype_empathy_analytics.sql](../migrations/0019_archetype_empathy_analytics.sql)
- Drizzle models: see `archetypeRollupDaily` / `archetypeMarkovDaily` in
  [shared/schema.ts](../shared/schema.ts).

## Non-goals (v1)

- No admin/observability UI. Read APIs exist; UI can come later.
- No predictive model training. This layer only provides the clean,
  archetype-keyed substrate Markov / RAG modules will consume.
- No retroactive reprocessing of `feedback_submitted` events emitted before
  this change landed (they lack avatar context).

## Extending

- Add a new signal kind: extend `ArchetypeSignalKind` in
  [server/lib/archetype-signal.ts](../server/lib/archetype-signal.ts),
  emit it from the relevant endpoint, and teach the rollup worker in
  [server/workers/archetype-rollup.ts](../server/workers/archetype-rollup.ts)
  to count it. No schema changes required.
- Add a new archetype: extend `ARCHETYPE_KEYS` in
  [shared/avatar-archetypes.ts](../shared/avatar-archetypes.ts), then map a
  companion avatar to it via `AVATAR_TO_ARCHETYPE`. Update the contract test
  in [shared/feedback-avatar-map.test.ts](../shared/feedback-avatar-map.test.ts)
  if one exists. The read APIs will pick the new archetype up automatically.
- Retune empathy weights: edit `EMPATHY_WEIGHTS` in
  [server/engines/archetype-empathy-engine.ts](../server/engines/archetype-empathy-engine.ts).
  Keep weights summing to 1.0 so the score stays comparable across releases.
