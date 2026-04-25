# AxTask Feature Deployment Contract

## 1) Feature identity

- Feature name: Command engine foundation + release guardrails
- Branch: `feature/2026-04-25-command-engine-release-guardrails`
- Date: 2026-04-25
- User-facing purpose: Add typed natural-language command input, shared parser/dispatcher mapping, and release-discipline guardrails for schema/env/docs consistency.

## 2) Code touched

- Client files: `client/src/components/command-palette.tsx`, `client/src/hooks/use-voice.tsx`, `client/src/App.tsx`, task/planner/UX polish files, and supporting keyboard/animation modules.
- Server files: `server/engines/dispatcher.ts`, `server/engines/dispatcher.test.ts`, `server/deploy-schema-workflow.test.ts`.
- Shared schema/types: `shared/intent/*`, `shared/schema/tasks.ts`, `shared/schema/__fixtures__/public-symbols.json`.
- Routes added/changed: No new route paths in this branch; dispatcher behavior for existing voice/text command processing was updated.
- Components added/changed: Added `CommandPalette`; updated task form + hotkey help + related shell wiring.

## 3) Database impact

- New tables: `task_reminders`
- New columns: None
- Changed constraints: Foreign keys on `task_reminders.user_id` (`ON DELETE CASCADE`) and `task_reminders.task_id` (`ON DELETE SET NULL`).
- Indexes: `idx_task_reminders_user`, `idx_task_reminders_remind_at`
- Enums: None
- Backfill needed: No
- Migration file created: Yes (`migrations/0036_task_reminders.sql`)
- Drizzle schema updated: Yes (`shared/schema/tasks.ts`)

## 4) Config impact

- New env vars: None
- Render env vars updated: No
- Local `.env.example` updated: Yes (Neon production guidance now prefers `sslmode=verify-full`)
- Feature flags: None
- Auth/callback/provider changes: None

## 5) Data/defaults

- Seed data needed: No
- Existing users affected: Existing users can keep using voice flow; typed command palette is additive and parser-backed intent mapping is backward-compatible fallback.
- Null/default behavior: `task_reminders.task_id` nullable; defaults include `delivery_channel='auto'`, `status='pending'`, and timestamp defaults.
- Backward compatibility: Maintained through dispatcher fallback to legacy classification when parser confidence/mapping does not fully cover an input.

## 6) Verification

- `npm run check`: Pass
- `npm test`: Pass
- `npm run build`: Pass
- `npm run test:deploy`: Pass (existing workflow coverage kept green)
- `npm run release:check`: Pass
- Local smoke test: `npm run intent:smoke` pass; typed command palette preview + submit path verified.
- Production smoke test: Pending post-merge deploy to production-tracking branch.

## 7) Rollback

- Can code rollback safely against new DB schema? Yes; old code paths remain compatible with additive table creation.
- Can DB rollback safely? Yes with controlled migration rollback (table drop only if no required reminder data retention obligation exists).
- Is migration destructive? No (additive DDL only).
- Emergency bypass needed? No.
