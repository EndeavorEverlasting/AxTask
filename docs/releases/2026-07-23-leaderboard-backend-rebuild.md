# Leaderboard Backend Rebuild

**Date:** 2026-07-23  
**Source:** unique product intent and candidate-native query design preserved from stale PR #54

## Delivered

- authenticated `GET /api/leaderboard` inside the existing gamification/avatar route module;
- validated categories: coins, streak, and contributions;
- validated periods: all and week;
- top-25 and signed-in-user result contract expected by the existing client page;
- current-user metadata, equipped title, and accumulated skill-level tier;
- deterministic public skill-tier helper and route architecture contracts.

## Architecture repair

The stale PR placed the endpoint in the 6,000-line route file and 244 lines of query logic in `server/storage.ts`. The preserved implementation uses:

- `server/routes/avatar.ts` for the authenticated validated route;
- `server/services/leaderboard-service.ts` for database queries;
- `server/services/leaderboard-ranking.ts` for database-free public tier logic.

PostgreSQL performs metric aggregation, deterministic tie ordering, row-number rank calculation, and the top-25 limit. The application receives only those rows plus the signed-in user's row, then loads profile, title, and skill metadata for that bounded user set.

No obsolete Replit symbols such as `forumPosts`, `forumComments`, or `skillUnlocks` were revived.

## Rollout

1. Merge only after focused contracts and full current-head CI pass.
2. Deploy through the normal authorized application release path; no migration is required.
3. Verify authenticated requests for all three categories and both periods.
4. Confirm an account outside the top 25 receives its deterministic rank and does not duplicate a top-25 row.
5. Observe endpoint latency and database query time before broadening leaderboard features.

## Validation

Focused ranking and route contracts, typecheck, full tests, release contract, production build, browser regression, performance budgets, Docker packaging, and disposable PostgreSQL migration/schema verification.

## Rollback

Remove the route registration, service, ranking helper, tests, and this release record. No schema or data rollback is required. The existing leaderboard client will return to its prior missing-backend error until a replacement endpoint is supplied.

## Proof ceiling

Repository and disposable-database validation do not prove production data quality, leaderboard fairness policy, live deployment, production latency, or user-visible production behavior.
