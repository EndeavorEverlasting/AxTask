# Skill tree roadmap

The unified skill tree ([`/skill-tree`](/skill-tree)) merges **avatar** skills (`avatar_skill_nodes` / `GET /api/gamification/avatar-skills`) and **idle** skills (`offline_skill_nodes` / `GET /api/gamification/offline-skills`) in one React Flow canvas. Data lives in two tables until a future consolidation makes sense.

## Near-term content (incremental)

- **Shopping list gate:** dendritic branch node `dendritic-shopping-list` — see [`docs/SHOPPING_LIST_FEATURE.md`](SHOPPING_LIST_FEATURE.md) before changing `/shopping`, exports, or classifier order.
- **Idle chain:** additional nodes for claim cadence hints, soft caps, or “return bonus” flavor tied to `offlineGenerators` — add rows in `seedOfflineSkillTree` / follow the `seedAvatarSkillTree` upsert pattern for production-safe inserts.
- **Companion / productivity chain:** widen `AVATAR_SKILL_TREE` with parallel branches (e.g. feedback, focus) using `prerequisiteSkillKey` to deepen the DAG without new mechanics.

## Later

- **Cross-domain prerequisites:** only after UX for locks and copy is clear; prefer soft ties (flavor + separate unlock) before foreign prerequisites across tables.
- **Single `skill_nodes` table + `kind` column:** optional when content stabilizes and migration cost is justified.

Performance: new nodes increase graph layout work — keep `SkillTreeGraph` lazy-loaded and watch `npm run perf:bundle` when adding heavy client dependencies.
