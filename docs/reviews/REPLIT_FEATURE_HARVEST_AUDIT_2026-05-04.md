# Replit Feature Harvest Audit - 2026-05-04

> Historical audit snapshot preserved from the Replit harvest train. Raw Replit branches remain contaminated source material; current feature status must be verified against `main` and current PRs before action.

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

## `subrepl-t97am75p` — Community leaderboards and rankings

**Historical status:** Partial preservation confirmed. Raw backend patch deferred.

### Candidate contained

- `client/src/pages/leaderboard.tsx`
- Frontend query to `/api/leaderboard`

### Candidate was missing

- `GET /api/leaderboard` route in `server/routes.ts`
- `getLeaderboard(...)` storage function in `server/storage.ts`

### Replit branch contained

- `GET /api/leaderboard` route in `server/routes.ts`
- `getLeaderboard(...)` function in `server/storage.ts`

### Dependency check result

The raw Replit backend patch was not safe to port as-is because it referenced schema/storage symbols absent from the stabilized candidate branch:

- `forumPosts`
- `forumComments`
- `skillUnlocks`

The exact raw patch was stale against the candidate schema.

### Decision

Do not paste the raw backend patch from `subrepl-t97am75p`.

Any backend restoration must be rewritten against current schema names and verified with:

- route proof;
- storage/schema proof;
- `npm run check`;
- smoke test of `/api/leaderboard?category=coins&period=all`;
- invalid category/period validation.

### Risk

A visible leaderboard UI that calls a missing backend route is a P2 runtime regression when the route is reachable in-app.

### Recommended follow-up

Use current repository evidence and the focused native PR, if still applicable. Do not revive stale `skillUnlocks` or old forum symbols merely to satisfy the UI.
