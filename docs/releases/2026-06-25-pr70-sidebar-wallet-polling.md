# PR #70: stop sidebar wallet polling on idle tabs

Date: 2026-06-25

## Summary

- Stops the sidebar wallet query from polling `/api/gamification/wallet` every 30 seconds.
- Keeps wallet freshness tied to mutation invalidation and normal query staleness instead of idle-tab intervals.
- Explicitly disables background interval refetching for the sidebar wallet surface.

## Production impact

- Reduces client-generated API traffic from idle browser tabs.
- Lowers avoidable database reads for wallet balance and streak data.
- Pairs with the recovery merge train's server-side telemetry and scheduled-resource pressure reductions.

## Risk

Low. The change narrows a sidebar refresh behavior without changing wallet serialization, mutation routes, or balance calculations.

## Validation

- `node scripts/release-check.mjs`
- `npm run check`
- `npx vitest run client/src/components/layout/sidebar.wallet-poll.test.ts`
