# Shopping list feature (contract)

This document pins the shopping list product surface so refactors do not drop the skill gate, NodeWeaver classification path, or export routes without an intentional review.

## Skill gate

- **Skill key:** `dendritic-shopping-list` (constant `DENDRITIC_SHOPPING_LIST_SKILL_KEY` in [`shared/shopping-list-feature.ts`](../shared/shopping-list-feature.ts)).
- **Seeded row:** Avatar skill tree in [`server/storage.ts`](../server/storage.ts) (`AVATAR_SKILL_TREE`), branch `dendritic`, prerequisite `export-efficiency`, `effectType: shopping_list_surface`.
- **Server enforcement:** [`userHasAvatarSkillUnlocked`](../server/storage.ts) must return true before any shopping-list export handler streams a body (403 `SHOPPING_LIST_LOCKED` otherwise).
- **Client unlock helper:** `computeShoppingListUnlocked` in the same shared module — used by [`client/src/components/layout/sidebar.tsx`](../client/src/components/layout/sidebar.tsx) to hide `/shopping` and by [`client/src/pages/shopping.tsx`](../client/src/pages/shopping.tsx) for the upsell vs list UI.

## NodeWeaver classification

- HTTP client: [`server/services/classification/nodeweaver-client.ts`](../server/services/classification/nodeweaver-client.ts) (`callNodeWeaverBatchClassify`).
- Label mapping: [`server/services/classification/nodeweaver-category-map.ts`](../server/services/classification/nodeweaver-category-map.ts).
- **Primary classifier:** [`classifyWithFallback`](../server/services/classification/universal-classifier.ts) tries the universal classifier URL first, then NodeWeaver when `NODEWEAVER_URL` is set, then `PriorityEngine`, then keyword rules.
- Premium bundle routes still call the same batch client from `routes.ts`.

## Task membership (shopping list view)

- Shared predicate: [`isShoppingTask`](../shared/shopping-tasks.ts) — used by [`TaskListHost`](../client/src/components/task-list-host.tsx) `variant="shopping"` prefilter and by shopping export generators so server and client agree.

## Paid exports

- **Kind:** `shoppingListExport` in [`server/productivity-export-pricing.ts`](../server/productivity-export-pricing.ts) (env `PRODUCTIVITY_EXPORT_SHOPPING_LIST`, default 8). Export-efficiency coin discounts apply the same way as other productivity exports.
- **Routes (POST, `requireAuth`):**
  - `/api/tasks/export/shopping-list/html`
  - `/api/tasks/export/shopping-list/spreadsheet` body `{ format: "csv" | "xlsx" }`
  - `/api/tasks/export/shopping-list/pdf`
- **Generators:** [`server/shopping-list-export-generators.ts`](../server/shopping-list-export-generators.ts) (HTML with `<input type="checkbox">`, spreadsheet with `Purchased` column, PDF with Unicode ballot boxes).

## Collaborative shared lists (dedicated entity)

- **Schema:** [`shared/schema/shopping-lists.ts`](../shared/schema/shopping-lists.ts) — `shopping_lists`, `shopping_list_members`, `shopping_list_items`. SQL migration [`migrations/0029_collaborative_shopping_lists.sql`](../migrations/0029_collaborative_shopping_lists.sql).
- **Policy:** Creating a shared list (`POST /api/shopping-lists`) and paid **exports** for a shared list require the same **Dendritic List Sense** skill as personal shopping exports. **Viewing / editing items** only requires membership (owner invites by email on `POST /api/shopping-lists/:listId/members`).
- **REST:** [`server/shopping-lists-routes.ts`](../server/shopping-lists-routes.ts) (mounted from [`server/routes.ts`](../server/routes.ts) via `attachShoppingListRoutes`).
- **Live sync:** WebSocket [`/ws/shopping`](../server/shopping-list-ws.ts) — client sends `join_list` after connect; server pushes `list_item_upsert`, `list_item_removed`, `list_reordered`. Hook [`client/src/hooks/use-shopping-list-live.ts`](../client/src/hooks/use-shopping-list-live.ts) merges events into the React Query cache.
- **UI:** [`/shopping/shared/:listId`](../client/src/pages/shopping-shared.tsx) — emerald row styling when `purchased`. Entry from [`/shopping`](../client/src/pages/shopping.tsx) (“Shared lists” card).

## Tests

- NodeWeaver classifier path: [`server/services/classification/universal-classifier-nodeweaver.test.ts`](../server/services/classification/universal-classifier-nodeweaver.test.ts)
- Category map: [`server/services/classification/nodeweaver-category-map.test.ts`](../server/services/classification/nodeweaver-category-map.test.ts)
- Export HTML/CSV: [`server/shopping-list-export-generators.test.ts`](../server/shopping-list-export-generators.test.ts)
- Unlock helper: [`shared/shopping-list-feature.test.ts`](../shared/shopping-list-feature.test.ts)
- Shopping page / `TaskListHost` wiring: [`client/src/components/task-list-host.shopping.contract.test.ts`](../client/src/components/task-list-host.shopping.contract.test.ts)
- Shared list routes: [`server/shopping-lists.contract.test.ts`](../server/shopping-lists.contract.test.ts)

## Related docs

- NodeWeaver deployment: [`docs/NODEWEAVER.md`](NODEWEAVER.md)
- Skill tree layout: [`docs/SKILL_TREE_ROADMAP.md`](SKILL_TREE_ROADMAP.md)
