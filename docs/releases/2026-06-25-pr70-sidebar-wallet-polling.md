# PR #70: stop sidebar wallet polling on idle tabs

Date: 2026-06-25

## Summary

- Stops the sidebar wallet query from polling `/api/gamification/wallet` every 30 seconds.
- Keeps wallet freshness tied to mutation invalidation and normal query staleness instead of idle-tab intervals.
- Explicitly disables background interval refetching for the sidebar wallet surface.
- Protects the wallet query with a query-scoped contract that requires `refetchInterval: false`, so alternate 30-second expressions or constants cannot bypass the regression test.

## Production impact

- Reduces client-generated API traffic from idle browser tabs.
- Lowers avoidable database reads for wallet balance and streak data.
- Pairs with the recovery merge train's server-side telemetry and scheduled-resource pressure reductions.

## Risk

Low. The change narrows a sidebar refresh behavior without changing wallet serialization, mutation routes, or balance calculations.

## Validation

Original validation:

- `node scripts/release-check.mjs`
- `npm run check`
- `npx vitest run client/src/components/layout/sidebar.wallet-poll.test.ts`

Clean rebuild proof, 2026-07-15:

- Rebuilt the three-file PR #70 surface over `main` after PR #73 landed.
- Validated source commit: `7cd3bea5aa99c166ea0ea5e06badb9ba20936343`.
- Isolated GitHub Actions rebuild run: `29431686739`.
- Passed `git diff --check` on the staged source surface.
- Passed the strengthened wallet polling contract.
- Passed `npm run release:check`.
- Passed `npm run check`.
- Passed the full `npm test` suite.
- Passed `npm run build`.
- The temporary rebuild workflow and repair script deleted themselves before the validated source commit was pushed.
