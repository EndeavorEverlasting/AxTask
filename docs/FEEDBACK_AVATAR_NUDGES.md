# Avatar-tied feedback nudges

This document explains how the AxTask feedback-prompt system is married to the
five companion avatars so users recognize *who* is asking for input, and how
the frequency of those prompts can be tuned per-avatar.

Related docs:

- [`docs/ORB_AVATAR_EXPERIENCE_CONTRACT.md`](ORB_AVATAR_EXPERIENCE_CONTRACT.md) — avatar product surface.
- [`docs/ADHERENCE_FEATURES.md`](ADHERENCE_FEATURES.md) — how push delivery interacts with feedback nudges.
- [`docs/NOTIFICATIONS_AND_PUSH.md`](NOTIFICATIONS_AND_PUSH.md) — VAPID setup & push delivery.

## Source-to-avatar map

The single source of truth is [`shared/feedback-avatar-map.ts`](../shared/feedback-avatar-map.ts).
It exports:

- `FEEDBACK_AVATAR_KEYS` — the five canonical companion keys.
- `DEFAULT_FEEDBACK_SOURCE_TO_AVATAR` — explicit assignments, grouped by persona:
  - **Archon (`archetype`)** — `classification_confirm`, `classification_thumbs_up`, `classification_reclassify`.
  - **Cadence (`productivity`)** — `task_create`, `task_complete`, `task_search_success`.
  - **Moodweaver (`mood`)** — `coin_claim_success`, `reward_redeem`, `feedback_submitted`.
  - **Nexus (`social`)** — `bulk_actions`, `community_post`, `community_reply`.
  - **Drift (`lazy`)** — `recalculate`, `recalculate_rating`, `dashboard_visit`.
- `KNOWN_FEEDBACK_SOURCES` — the list of source strings used in production today.
- `getAvatarForSource(source)` — returns the mapped key, falling back to `archetype`.

### Adding a new nudge source

1. Pick the best-fit companion (analytical/archetype, action-oriented/productivity,
   reflective/mood, community/social, or calm/lazy).
2. Add the string to both `KNOWN_FEEDBACK_SOURCES` and
   `DEFAULT_FEEDBACK_SOURCE_TO_AVATAR`.
3. The contract test `shared/feedback-avatar-map.test.ts` will fail until the
   two lists agree, catching drift.

## Slider math (master × per-avatar)

[`client/src/lib/feedback-nudge.ts`](../client/src/lib/feedback-nudge.ts)
composes the effective intensity per call site:

```
effective = clamp(master * (byAvatar[avatarKey] ?? master) / 100, 0, 100)
```

- When the avatar slider is **unset**, the effective intensity equals `master`.
- When the avatar slider is **0**, that companion is fully silenced without
  affecting the others.
- At `effective === 0` the nudge policy blocks every request.

The policy buckets (`<= 30`, `<= 70`, `> 70`) drive the existing cadence
controls (cooldown, per-source cap, per-day cap, per-day weighted score cap)
and also the new per-avatar cap + per-avatar cooldown:

| Bucket | cooldown | sourceCap | avatarCap | avatarCooldown |
| ------ | -------- | --------- | --------- | -------------- |
| 0      | ∞        | 0         | 0         | ∞              |
| ≤ 30   | 180s     | 2         | 2         | 360s           |
| ≤ 70   | 90s      | 3         | 4         | 180s           |
| > 70   | 45s      | 8         | 6         | 60s            |

## Hybrid persistence

Preferences are persisted **both** on the server and in `localStorage` under
`axtask.feedbackNudgePrefs`:

- `useNotificationMode` seeds the `localStorage` cache from the
  `/api/notifications/preferences` response on load (write-through).
- The `FeedbackNudgeSliders` settings component writes to the cache
  immediately and debounces a `PATCH /api/notifications/preferences`
  (500 ms). This keeps the UI responsive while letting the server be the
  source of truth across devices.
- The server sanitizes and clamps values (`server/storage.ts`'s
  `sanitizeFeedbackNudgePrefs` + `mergeFeedbackNudgePrefs`) so a malformed
  patch cannot poison the stored JSON blob.

Schema:

- Column: `user_notification_preferences.feedback_nudge_prefs jsonb NOT NULL DEFAULT '{"master":50,"byAvatar":{}}'`.
- Migration: [`migrations/0018_notification_preferences_feedback_nudge_prefs.sql`](../migrations/0018_notification_preferences_feedback_nudge_prefs.sql).
- Drizzle model: [`shared/schema.ts`](../shared/schema.ts) (`userNotificationPreferences`).
- Zod: `feedbackNudgePrefsSchema`, embedded in `updateNotificationPreferenceSchema` as `feedbackNudgePrefs.partial()`.

## Dialog persona

[`FeedbackNudgeDialog`](../client/src/components/feedback-nudge-dialog.tsx):

- Reads the avatar from the dispatched event's `detail.avatarKey`, falling
  back to `getAvatarForSource(source)`.
- Renders an `AvatarGlowChip` and the companion's display name
  (`FEEDBACK_AVATAR_NAMES[avatarKey]`).
- Pulls a random opener from `/api/gamification/avatar-voices` (cached
  `staleTime: Infinity`) and falls back to a per-avatar `FALLBACK_OPENERS`
  literal when the voices query is unavailable (offline/anonymous).
- The primary action navigates to
  `/feedback?avatar=<avatarKey>&source=<source>` so the feedback page can
  show which companion triggered the conversation.

## Adding a new opener for an avatar

Openers are edited in a single place —
[`server/engines/dialogue-engine.ts`](../server/engines/dialogue-engine.ts)'s
`ORB_VOICES` / `MORE_VOICES` arrays. The `listAvatarVoiceOpeners()` helper
surfaces them to `/api/gamification/avatar-voices` unchanged, so adding a new
opener only requires editing the voice array.

## AI planner: clickable insights

[`server/engines/pattern-engine.ts`](../server/engines/pattern-engine.ts)'s
`PatternInsight` now carries an optional `taskIds?: string[]`:

- `similarity_cluster`: up to 5 ids from the cluster's underlying tasks.
- `recurrence`: up to 5 ids from the most recent occurrences (newest first).
- `topic`: up to 5 ids from tasks containing the topic phrase.
- `deadline_rhythm`: **omits** `taskIds` — aggregate-only by design.

[`client/src/pages/planner.tsx`](../client/src/pages/planner.tsx) wraps each
insight in a button:

- If `insight.taskIds?.[0]` exists, navigate to
  `/tasks?task=<id>`. `tasks.tsx` fetches the task and dispatches
  `axtask-open-task-edit`, which `task-list.tsx` consumes via
  `setEditingTask(task)` to open the edit dialog.
- Otherwise, navigate to `/tasks` and dispatch `axtask-focus-task-search`
  with a pre-filled `detail.query` derived from the insight's activity data.

## Tests

- `shared/feedback-avatar-map.test.ts` — map integrity, fallback resolution.
- `client/src/lib/feedback-nudge.test.ts` — per-avatar math, caps, cooldowns, hybrid cache round-trip.
- `client/src/components/feedback-nudge.contract.test.ts` — dialog + settings UI wiring.
- `server/notification-preferences.contract.test.ts` — schema/route/storage round-trip + migration 0018.
- `server/pattern-engine-insights.contract.test.ts` — pattern-engine surfaces `taskIds`.
- `client/src/pages/planner-tasks-click.contract.test.ts` — planner click + `/tasks?task=<id>` + event wiring.
