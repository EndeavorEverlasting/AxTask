# Skill Tree Persistence Forensics - 2026-05-05

> **Resolution update — 2026-07-22:** The missing offline persistence migration identified by this audit was preserved through the clean main-based PR #65 and merged as commit `87b2756ee703af2ed9457457aa5e2269552db345`. The raw Replit implementation remains rejected. Candidate-native endpoint and cross-device persistence proof remain separate validation work.

## Executive Summary

Replit branch `subrepl-dbmojt3g` contains valid product intent but stale implementation.

The product idea is clear: Skill Tree unlocks must persist server-side so progression survives refresh, logout/login, and use across devices.

The raw branch should not be ported directly. It implements an older single-tree model using a stale `skillUnlocks` table and `/api/skill-unlocks` endpoints. The candidate branch already has a newer dual-tree gamification architecture using avatar and offline skill persistence tables.

Final classification:

```text
PARTIALLY PRESERVED
```

The intent is preserved. The stale implementation is rejected. Candidate-native migration and smoke proof were the original follow-up requirements; the migration is now merged, while endpoint and cross-device proof remain to be verified.

## Source Branch

| Field | Value |
|---|---|
| Source branch | `subrepl-dbmojt3g` |
| Source head | `c899f25594f549518fabb4ece32d91c61588936a` |
| Source task | `Task #34: Persist Skill Tree unlock state server-side for cross-device sync` |
| Compared against | `origin/candidate/2026-05-04-replit-code-only` |
| Candidate head reviewed | `9184dfcc7c8ecad8d8b93731c0455652ef6a217c` |
| Review date | 2026-05-05 |

## Source Diff Summary

Raw source branch touched:

| File | Action | Finding |
|---|---:|---|
| `client/src/pages/skill-tree.tsx` | Modified | Rewrites older single-page Skill Tree UI |
| `server/routes.ts` | Modified | Adds `/api/skill-unlocks` routes |
| `server/storage.ts` | Modified | Adds `getSkillUnlocks()` and `unlockSkillNode()` |
| `shared/schema.ts` | Modified | Adds stale `skillUnlocks` table |
| `shared/skill-nodes.ts` | Added | Extracts old static skill node data |

Diff size observed:

```text
5 files changed, 339 insertions(+), 155 deletions(-)
```

## Stale Implementation Signals

The source branch introduces or depends on:

```text
skillUnlocks
/api/skill-unlocks
shared/skill-nodes.ts
```

Those symbols do not match the candidate-native architecture.

The source branch also rewrites `client/src/pages/skill-tree.tsx`, but the candidate branch already routes `/skill-tree` to `UnifiedSkillTreeView` and uses the newer gamification API paths.

## Candidate-Native Architecture

The candidate branch already has newer Skill Tree persistence symbols:

```text
offlineSkillNodes
userOfflineSkills
avatarSkillNodes
userAvatarSkills
seedOfflineSkillTree
seedAvatarSkillTree
```

Candidate client paths observed:

```text
/api/gamification/avatar-skills
/api/gamification/avatar-skills/unlock
/api/gamification/offline-skills
/api/gamification/offline-skills/unlock
```

Candidate storage behavior observed:

| Domain | Node table | User persistence table | Behavior |
|---|---|---|---|
| Avatar skills | `avatarSkillNodes` | `userAvatarSkills` | Reads current levels, enforces prerequisites, spends coins, inserts or updates user skill level |
| Offline skills | `offlineSkillNodes` | `userOfflineSkills` | Reads current levels, requires offline generator ownership, enforces prerequisites, spends coins, inserts or updates user skill level |

Candidate route startup also calls:

```text
seedOfflineSkillTree()
seedAvatarSkillTree()
```

## Preservation Classification

| Layer | Status | Notes |
|---|---:|---|
| Product intent | Preserved | Replit branch clearly captures server-side persistence goal |
| Raw Replit implementation | Unsafe to port | Uses stale schema, stale route model, and old UI |
| Candidate UI | Preserved | `/skill-tree` exists and renders unified dual-tree UI |
| Candidate client calls | Preserved | Client uses gamification skill endpoints |
| Candidate avatar persistence | Preserved | Schema, storage, and migration proof exist |
| Candidate offline persistence | Migration preserved | Schema and storage exist; the missing SQL migration was merged through PR #65 |
| Tests and smoke proof | Partial | Client path/graph tests and offline seed contracts exist, but endpoint and cross-device persistence proof remain to be verified |

## Migration Finding and Resolution

The original audit found avatar skill migration coverage:

```text
migrations/0011_avatar_support_and_combo_chain.sql
migrations/0015_rename_avatar_skill_key_unique.sql
```

It did not find a migration creating:

```text
offline_skill_nodes
user_offline_skills
```

That gap was resolved by PR #65, which added:

```text
migrations/0042_offline_skill_tree_tables.sql
```

The migration creates the offline skill node and per-user persistence tables with the required constraints and indexes. This resolves the migration-history gap without porting the obsolete Replit model.

## Rejection Decision

Do not port `subrepl-dbmojt3g` raw.

Reject these raw branch elements:

```text
skillUnlocks table
/api/skill-unlocks routes
old task-count unlock model
old static shared/skill-nodes.ts model
client/src/pages/skill-tree.tsx rewrite
```

Preserve this product intent:

```text
Skill Tree progression must persist server-side and survive refresh, login changes, and cross-device use.
```

Implement or verify that intent only through the candidate-native tables and endpoints:

```text
avatarSkillNodes
userAvatarSkills
offlineSkillNodes
userOfflineSkills
/api/gamification/avatar-skills
/api/gamification/offline-skills
```

## Remaining Follow-Up

### Endpoint persistence proof

Add or verify tests proving:

- `GET /api/gamification/avatar-skills` returns seeded nodes and persisted current levels.
- `POST /api/gamification/avatar-skills/unlock` writes `userAvatarSkills`.
- `GET /api/gamification/offline-skills` returns seeded nodes and persisted current levels.
- `POST /api/gamification/offline-skills/unlock` writes `userOfflineSkills`.
- Refresh/logout/login reads persisted state from the database rather than local client state.

### Foundry lesson capture

This branch is a clean example of Replit preserving user intent while generating obsolete implementation.

Foundry should classify similar branches as:

```text
intent preserved
raw implementation stale
candidate-native rewrite required
do not port wholesale
```

## Final Recommendation

Keep this document as historical audit evidence.

No implementation patch should use `skillUnlocks` unless a future architecture decision explicitly revives that event-table model.