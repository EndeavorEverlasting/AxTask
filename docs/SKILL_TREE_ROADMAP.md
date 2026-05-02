# Skill tree roadmap

The unified skill tree ([`/skill-tree`](/skill-tree)) merges **avatar** skills (`avatar_skill_nodes` / `GET /api/gamification/avatar-skills`) and **idle** skills (`offline_skill_nodes` / `GET /api/gamification/offline-skills`) in one React Flow canvas. Data lives in two tables until a future consolidation makes sense.

## Graph contract (edges)

The capability graph supports six edge kinds. `prerequisite` is the legacy single-parent chain. The other five are declared via `additionalEdges` on `SkillNodeDto` and styled automatically by `buildSkillTreeFlowLayout`.

| Edge kind | Meaning | Visual |
|---|---|---|
| `prerequisite` | Must unlock before target is available | Solid gray (`--border`) |
| `synergy` | Skills that boost each other when both active | Dashed primary |
| `continuum` | Archetype or progression continuum link | Dotted muted |
| `unlocks_generator` | Grants access to an idle/offline generator feature | Solid cyan |
| `unlocks_engine` | Grants access to an automation engine | Solid violet |
| `unlocks_ui_surface` | Unlocks a new UI surface or view | Solid amber |

Layout direction: `SkillTreeLayoutDirection` accepts `"TB"` (default) or `"LR"`. Pass it via `buildSkillTreeFlowLayout(nodes, { direction: "LR" })`. The canvas does not expose a UI toggle yet.


## Near-term content (incremental)

- **Shopping list gate:** dendritic branch node `dendritic-shopping-list` — see [`docs/SHOPPING_LIST_FEATURE.md`](SHOPPING_LIST_FEATURE.md) before changing `/shopping`, exports, or classifier order.
- **Idle chain:** additional nodes for claim cadence hints, soft caps, or “return bonus” flavor tied to `offlineGenerators` — add rows in `seedOfflineSkillTree` / follow the `seedAvatarSkillTree` upsert pattern for production-safe inserts.
- **Companion / productivity chain:** widen `AVATAR_SKILL_TREE` with parallel branches (e.g. feedback, focus) using `prerequisiteSkillKey` to deepen the DAG without new mechanics.

## Later

- **Cross-domain prerequisites:** only after UX for locks and copy is clear; prefer soft ties (flavor + separate unlock) before foreign prerequisites across tables.
- **Persisted additional edges:** once the schema supports it, `avatarSkillNodes` / `offlineSkillNodes` can store `additionalEdges` and the server DTOs will forward them without client changes.

- **Single `skill_nodes` table + `kind` column:** optional when content stabilizes and migration cost is justified.

Performance: new nodes increase graph layout work — keep `SkillTreeGraph` lazy-loaded and watch `npm run perf:bundle` when adding heavy client dependencies.
