# AxTask database retention policy

This document is the single source of truth for how long AxTask keeps rows in
append-only / audit / derived tables. It exists to keep the Neon project
(and any future Postgres host) under its storage cap, to keep queries fast
against the working set, and to ensure future features that add append-only
tables default to having a retention window instead of growing forever.

**Operational scripts are kept in lockstep with this doc:**

- Nightly job: [scripts/db-retention.mjs](../scripts/db-retention.mjs) —
  `DELETE`s only, idempotent, safe to re-run.
- One-shot reclaim: [scripts/db-reclaim.mjs](../scripts/db-reclaim.mjs) —
  `TRUNCATE` + `VACUUM FULL` + optional `DROP INDEX`, requires
  `--confirm=YES --prod`, used only during maintenance windows.
- Audit: [scripts/db-size-audit.mjs](../scripts/db-size-audit.mjs) — read-only,
  produces the JSON input the reclaim script consumes for `DROP INDEX`.

## Windows

| Table                         | Column      | Window    | Rationale |
| ---                           | ---         | ---       | --- |
| `security_logs`               | `created_at`| 90 days   | Recent login/logout audit. Matches the default Neon-free / small-plan sweet spot. SOC-2 shops should raise to 365 days and size the DB plan accordingly. |
| `security_events`             | `created_at`| 90 days   | Archetype signals + dispute / classification events. Actor is HMAC-hashed (`server/lib/actor-hash.ts`); older rows are only useful for long-term trend analysis, which the daily rollups already cover. |
| `idempotency_keys`            | `created_at`| 7 days    | Keys only matter for retry windows measured in minutes. A week is already very generous. |
| `mfa_challenges`              | `expires_at`| 1 day    | Challenges are consumed within minutes. The expiry-based sweep also catches abandoned challenges. |
| `password_reset_tokens`       | `expires_at`| 1 day    | Same reasoning as MFA. |
| `task_import_fingerprints`    | `created_at`| 90 days   | Dedup hashes age out faster than most users re-import the same bundle twice. |
| `invoice_events`              | `created_at`| 365 days  | Long-enough window to cover a full billing-cycle audit. |
| `premium_events`              | `created_at`| 365 days  | Same reasoning as invoice events. |
| `study_review_events`         | `created_at`| 730 days  | Spaced-repetition history older than two years is rarely surfaced to the user and can always be rebuilt from `study_cards`. |
| `usage_snapshots`             | `created_at`| 180 days  | Rolling six-month view is enough for the analytics page; older data is summarized elsewhere. |

**Windows explicitly live in two places** — this table and
`RETENTION_WINDOWS` at the top of [scripts/db-retention.mjs](../scripts/db-retention.mjs).
Change them together in the same PR.

## Not touched by retention

These tables are user-facing or correctness-critical and **never** pruned by
the retention job or the reclaim script, even in aggressive mode:

- `tasks`, `task_collaborators`, `attachment_assets`, `message_attachments`
- `wallets`, `coin_transactions`, `user_badges`, `rewards_catalog`,
  `user_rewards`
- `users`, `user_*_preferences`, `user_adherence_*`, `user_avatar_*`
- `classification_contributions`, `classification_confirmations`,
  `classification_disputes`, `classification_dispute_votes`,
  `category_review_triggers`
- `community_posts`, `community_replies`
- `premium_subscriptions`, `premium_saved_views`, `premium_review_workflows`,
  `premium_insights`
- `invoices` (the events feeding them can be pruned, not the invoices
  themselves)

If a future PR adds a new append-only table that fits the "audit / expired /
derived" shape, add it to this table and to `RETENTION_WINDOWS` in the same PR.

## Derived tables (truncate-and-rebuild)

Only `db-reclaim.mjs` touches these, and only during maintenance:

- `archetype_rollup_daily`, `archetype_markov_daily` — derived from
  `security_events`; a full `TRUNCATE` is safe because the next scheduled
  rollup recomputes them from whatever signal history remains.

## Aggressive one-shot reclaim (prod only)

When the DB gets close to its storage cap, run the reclaim script during a
short maintenance window. The [phase sequence is documented in the Neon
unblock plan](./DB_RETENTION_POLICY.md) and summarised here:

1. `pg_dump --format=custom` the DB to local disk first.
2. `node scripts/db-size-audit.mjs --json > audit.json` to see where the
   weight is.
3. `node scripts/db-reclaim.mjs --confirm=YES --prod --dry-run` and read the
   output carefully before dropping `--dry-run`.
4. Re-run the audit afterwards to confirm `pg_database_size` dropped.

`VACUUM FULL` in the reclaim script holds an `ACCESS EXCLUSIVE` lock per
table; plan for ~30-60 seconds of unavailability per large table.

## Scheduling

The retention script runs nightly. The wiring (Render cron service vs.
existing scheduler) is tracked in the Neon unblock plan, not here.
