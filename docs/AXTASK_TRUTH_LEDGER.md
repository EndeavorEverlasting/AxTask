# AxTask Truth Ledger

**Date:** 2026-07-23  
**Verified HEAD:** `308cab74da17249a9a9dcfe2fd5159524d8771c7`  
**PR Floor:** PR #68 (quarantined draft)

---

## 1. Identity & Current Repository Floor

- **Repository:** `EndeavorEverlasting/AxTask`
- **Current `main` HEAD:** `308cab74da17249a9a9dcfe2fd5159524d8771c7`
- **Collision Harness:** Landed on `main` via PR #92 (`scripts/ai-harness/inspect-pr-collisions.mjs`).
- **Backup Center UI:** Landed on `main` via `client/src/pages/backup.tsx` with sidebar navigation and route integration.
- **Leaderboard Backend:** Landed on `main` via PR #102 (`server/services/leaderboard-service.ts`, `server/routes/avatar.ts`).
- **DB-Free Render Liveness:** Landed on `main` via PR #101 (`render.yaml` `healthCheckPath: /health`).
- **Windows Backup Airlock:** Landed on `main` via PR #95 (`scripts/db/pg-tools.mjs`).

---

## 2. What AxTask Purports To Be vs. What Main Actually Proves

| Domain / Feature | Claimed State | Actual `main` Proof Level | Evidence / Notes |
|---|---|---|---|
| PR Collision Inspection | Automated harness | **Contract / Code** | `scripts/ai-harness/inspect-pr-collisions.mjs` runs and passes |
| Backup Center UI | Dedicated UI page | **UI / Route** | `client/src/pages/backup.tsx` mounted at `/backup` |
| Backup Airlock & DB Tools | Hardened backup/restore | **Contract / Static** | `scripts/db/backup.mjs`, `scripts/db/restore-test.mjs`, `scripts/db/pg-tools.mjs` |
| Skill Tree Graph | Unified canvas layout | **UI / Client-only** | `client/src/lib/skill-tree-graph-build.ts`; `additionalEdges` lives in client only |
| Offline & Avatar Skills | Gamification system | **API / Contract** | `GET/POST /api/gamification/avatar-skills`, `GET/POST /api/gamification/offline-skills` |
| Leaderboard Backend | Top 25 & user rank | **API / SQL** | `server/services/leaderboard-service.ts` uses SQL aggregation & deterministic ordering |
| Render Process Liveness | DB-free health probe | **Configuration** | `render.yaml` `healthCheckPath: /health` verified |

---

## 3. Claim-Versus-Proof Ledger & Gaps

### Landed / Completed Sprints
1. **P00 Collision Harness:** Fully landed. `node scripts/ai-harness/inspect-pr-collisions.mjs` passes with 0 collisions.
2. **Backup Center UI:** Fully landed. Mounted in `App.tsx` and sidebar.
3. **Leaderboard Backend:** Fully landed. Aggregates via SQL `LIMIT 25`.
4. **DB-Free Liveness:** Fully landed. `render.yaml` targets `/health`.

### Remaining Work / Active Gaps
1. **P01 — Skill Tree Data Wiring & Cross-Domain Behavior:**
   - *Gap:* `additionalEdges` is defined and rendered in client-side graph code (`skill-tree-graph-build.ts`), but server DTOs do not populate non-prerequisite edges or cross-domain relationships between avatar and offline skills.
   - *Next Step:* Wire graph semantics through shared DTO contracts and server catalog sources.

2. **P02 — Backup/Restore Local Certification:**
   - *Gap:* Static backup tests pass, but disposable local runtime certification (synthetic round-trip proof generation) needs a dedicated harness capability and runner.
   - *Next Step:* Build executable certification script and register `backup-restore-local-certification` capability.

---

## 4. PR Floor & Quarantine Boundary

- **Open PRs:** Exactly 1 open PR remains: **PR #68** (`feat/usage-truth-sprint-2026-05`).
- **Quarantine Reason:** PR #68 overlaps telemetry, provider usage, and scheduled resource controls. Its contract requires a 24–48h stable production observation before any safe rebuild from `main`.
- **Status:** Quarantined draft — **DO NOT MERGE**.

---

## 5. Gate G0 Decision

- **Gate G0 Status:** **PASSED / GREEN**.
- **Parallel Group A Authorized:**
  - **P01:** `feat/skill-tree-data-ux-completion`
  - **P02:** `cert/backup-restore-local-runtime`
