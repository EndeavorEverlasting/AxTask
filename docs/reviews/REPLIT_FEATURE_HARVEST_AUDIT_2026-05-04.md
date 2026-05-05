# Replit Feature Harvest Audit - 2026-05-04

Base candidate: `candidate/2026-05-04-replit-code-only`  
Current audit branch: `audit/2026-05-04-replit-feature-harvest`  
Target posture: preserve useful Replit-era feature intent without merging destructive Replit branch state.

## Rules

- Do not merge raw Replit branches wholesale.
- Do not mutate PR #52 unless explicitly intended.
- Treat giant Replit branches as contaminated source material.
- Only port features when UI, route, storage/schema, and typecheck proof are aligned.
- Do not claim preservation unless the feature path has backend and frontend proof.

## Priority Model

- P0: Security, auth, data loss, DB corruption. Fix before deploy.
- P1: Build, deployment, migration, startup failure. Fix before deploy.
- P2: Runtime regression or broken user workflow. Fix before merge.
- P3: Edge case/test gap. Fix if cheap, otherwise defer.
- P4: Maintainability/refactor/optimization. Usually defer.
- P5: Style/noise. Defer or reject.

---

## subrepl-t97am75p - Community leaderboards & rankings

**Status:** Partial preservation confirmed. Raw backend patch deferred.

### Candidate contains

- `client/src/pages/leaderboard.tsx`
- Frontend query to `/api/leaderboard`

### Candidate missing

- `GET /api/leaderboard` route in `server/routes.ts`
- `getLeaderboard(...)` storage function in `server/storage.ts`

### Replit branch contains

- `GET /api/leaderboard` route in `server/routes.ts`
- `getLeaderboard(...)` function in `server/storage.ts`

### Dependency check result

The raw Replit backend patch is not safe to port as-is because it references schema/storage symbols that are not present in the stabilized candidate branch:

- `forumPosts`
- `forumComments`
- `skillUnlocks`

Candidate does contain related systems such as wallets, coin transactions, classification contributions, rewards, users, and community-style objects, but the exact Replit backend patch appears stale against the current candidate schema.

### Decision

Do not paste the raw backend patch from `subrepl-t97am75p`.

Defer direct backend restoration until the leaderboard query is rewritten against the actual candidate schema names and verified with:

- route proof
- storage/schema proof
- `npm run check`
- smoke test of `/api/leaderboard?category=coins&period=all`
- smoke test of invalid category/period validation

### Risk

Current candidate has a visible leaderboard UI that calls a missing backend route. This is a P2 runtime regression if the leaderboard route is reachable in-app.

### Recommended follow-up

Build a candidate-native leaderboard backend using the stabilized schema instead of the stale Replit branch symbols.

Likely candidate-native replacements to inspect:

- `communityPosts` or equivalent for forum post counts
- `communityReplies` or equivalent for comment counts
- `userOfflineSkills`, `userAvatarSkills`, or equivalent for skill tier
- existing wallet and coin transaction tables for coin/streak rankings

Do not implement until those equivalents are proven by grep and typecheck.
