# Skill Tree Persistence Forensics - 2026-05-05

## Executive Summary

Replit branch `subrepl-dbmojt3g` contains valid product intent but stale implementation.

The product idea is clear: Skill Tree unlocks must persist server-side so progression survives refresh, logout/login, and use across devices.

The raw branch should not be ported directly. It implements an older single-tree model using a stale `skillUnlocks` table and `/api/skill-unlocks` endpoints. The candidate branch already has a newer dual-tree gamification architecture using avatar and offline skill persistence tables.

Final classification:

```text
PARTIALLY PRESERVED
```

The intent is preserved. The stale implementation is rejected. Candidate-native migration and smoke proof remain required before this feature can be called fully deployable.

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
| Candidate offline persistence | Partially preserved | Schema and storage exist, but migration proof was not confirmed in the reviewed output |
| Tests and smoke proof | Partial | Client path/graph tests and offline seed contract exist, but endpoint persistence smoke proof remains needed |

## Migration Finding

Migration grep output showed avatar skill migration coverage:

```text
migrations/0011_avatar_support_and_combo_chain.sql
migrations/0015_rename_avatar_skill_key_unique.sql
```

The same reviewed output did not show a migration creating:

```text
offline_skill_nodes
user_offline_skills
```

That is a deployability risk. If those tables are only present in schema code and not migration history, offline skill persistence can fail in a clean database.

Priority:

```text
P1 if migration is missing in deploy path
P2 if migration exists elsewhere but was not proven in this audit
```

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

## Required Follow-Up

### P1/P2: Verify offline skill migrations

Run:

```bash
grep -RIn 'offline_skill_nodes\|user_offline_skills' migrations shared server
```

If no migration creates these tables, add an idempotent migration before claiming offline skill persistence is deployable.

### P3: Add endpoint persistence smoke proof

Add tests proving:

- `GET /api/gamification/avatar-skills` returns seeded nodes and persisted current levels.
- `POST /api/gamification/avatar-skills/unlock` writes `userAvatarSkills`.
- `GET /api/gamification/offline-skills` returns seeded nodes and persisted current levels.
- `POST /api/gamification/offline-skills/unlock` writes `userOfflineSkills`.
- Refresh/logout/login reads persisted state from the database rather than local client state.

### P3: Foundry lesson capture

This branch is a clean example of Replit preserving user intent while generating obsolete implementation.

Foundry should classify similar branches as:

```text
intent preserved
raw implementation stale
candidate-native rewrite required
do not port wholesale
```

## Final Recommendation

Keep this as a docs-only audit PR.

Next implementation branch should be narrow and candidate-native. Suggested next branches:

```text
fix/2026-05-05-offline-skill-migration-proof
```

or:

```text
test/2026-05-05-skill-tree-persistence-smoke
```

No implementation patch should use `skillUnlocks` unless a future architecture decision explicitly revives that event-table model.
