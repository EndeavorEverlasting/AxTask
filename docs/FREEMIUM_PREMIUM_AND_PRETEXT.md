# Freemium economy, premium benefits, and Pretext-first UI

This document captures **product intent** so future refactors (especially around React vs Pretext and AxCoins) do not accidentally regress it.

## Freemium vs premium

- **AxCoins** are an in-product engagement currency. They reward actions (completions, feedback, classification, and similar loops) and fund optional productivity exports.
- **Avatar levels and the avatar skill tree** improve returns on engagement: for example, the `export-efficiency` skill reduces the **Markdown task export** price stepwise for free users (default base **5 → 4 → 3 → 2 → 1 → 0** coins as the skill levels up, capped at zero).
- **Paid subscribers** (AxTask Pro or bundle, as reflected in `getPremiumEntitlements().products`) pay **0 AxCoins** for Markdown single-task export regardless of skill level—convenience and economics, not exclusive access to the underlying task data.

Implementation anchors:

- Pricing: [`server/markdown-export-price.ts`](../server/markdown-export-price.ts) (pure helpers) and [`server/productivity-export-pricing.ts`](../server/productivity-export-pricing.ts) (wallet + skill DB lookups).
- Task report route: `POST /api/tasks/:taskId/report` with `format: "md"` in [`server/routes.ts`](../server/routes.ts).

## Goals and daily productivity report

In AxTask copy and analytics, **goals** mean **incomplete work you are still carrying**, not a separate schema table:

- Every **pending** or **in-progress** task is an open goal.
- **Highlighted** goals surface signals for long-horizon or heavy work: repeating / recurring tasks, long planned duration (`durationMinutes` threshold), or heavy prerequisites / dependency fan-out.

Daily report endpoints:

- `GET /api/analytics/daily-report?from=YYYY-MM-DD&to=YYYY-MM-DD` — JSON payload built by [`server/daily-productivity-report.ts`](../server/daily-productivity-report.ts).
- `POST /api/analytics/daily-report/download` with `{ from, to }` — Markdown download (currently **free**).

## Feedback and avatar missions

Submitting product feedback must advance the mapped companion via `engageAvatarMission` so XP and mission coins accrue in the same way as other mission sources. Resolver: [`server/feedback-avatar-mission.ts`](../server/feedback-avatar-mission.ts).

## Pretext vs React

- **Pretext** covers immersive shell chrome, page headers, typography/wrap helpers, and **hot-path list controllers** (for example [`client/src/lib/pretext-imperative-list.ts`](../client/src/lib/pretext-imperative-list.ts)) so large tables are not re-rendered by React on every keystroke.
- **React** remains the composition layer for forms, dialogs, and moderate-sized trees—use it where declarative state is cheaper than bespoke DOM wiring.
- When adding heavy UI, default to **extending Pretext patterns** before mounting new parallel React trees for the same data.

Related: [`docs/FEEDBACK_AVATAR_NUDGES.md`](FEEDBACK_AVATAR_NUDGES.md), [`docs/MODULE_LAYOUT.md`](MODULE_LAYOUT.md), [`docs/ORB_AVATAR_EXPERIENCE_CONTRACT.md`](ORB_AVATAR_EXPERIENCE_CONTRACT.md).

## Task list header contract

The `/tasks` experience must keep **interactive header sorting and per-column
header filtering** in `TaskListHost`; top controls are additive, not a
replacement. Canonical contract + tests: [`docs/TASK_LIST_INTERACTION_CONTRACT.md`](TASK_LIST_INTERACTION_CONTRACT.md).
