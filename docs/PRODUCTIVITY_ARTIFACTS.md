# Productivity artifacts, coins, and agent-driven events

This document ties **exports** (PDF, spreadsheets, **Gantt**, **Mermaid**), **AxCoins**, the **offline generator**, **avatar progression**, and **agent disputes / council** flows into one traceable plan.

## What exists today

- **PDF checklist:** [`server/checklist-pdf.ts`](../server/checklist-pdf.ts), routes in [`server/routes.ts`](../server/routes.ts), UI [`client/src/pages/checklist.tsx`](../client/src/pages/checklist.tsx).
- **Coins and wallet:** [`shared/schema.ts`](../shared/schema.ts) (`coin_transactions`, `rewardsCatalog`, wallets), award paths in [`server/coin-engine.ts`](../server/coin-engine.ts), spend patterns in [`server/routes.ts`](../server/routes.ts).
- **Offline “steady” coin generator + skill tree:** [`server/storage.ts`](../server/storage.ts) (`getOrCreateOfflineGenerator`, `claimOfflineGeneratorCoins`, `upgradeOfflineGenerator`, `getOfflineSkillTree`, `unlockOfflineSkill`) and `/api/gamification/offline-generator/*`, `/api/gamification/offline-skills/*`. The generator provides **coins over time** so users can **afford exports and unlocks** without only grinding task completions.
- **Lazy avatar XP (incl. “kick back”):** [`server/services/gamification/lazy-avatar-xp.ts`](../server/services/gamification/lazy-avatar-xp.ts) — rest/ease phrases reward the lazy companion.

## Product principles

1. **Gantt engine is high priority** — Ship **task/schedule → Gantt artifact** (server module + API + user-facing export or task attachment) **before** relying on dispute-only demos.
2. **Mermaid > Gantt in price** — Mermaid (dependency / flow truth) is **more valuable** than Gantt for many users; **`rewardsCatalog`** should charge **more** for Mermaid export than Gantt (exact ratios TBD).
3. **Engagement before unlimited free utility** — Prefer **unlocks via participation** (tutorials, disputes, streaks) plus **coin spend**, rather than every export being free forever with no attachment to the product story.
4. **Steady generator supports cadence** — Upgraded generator **rate/cap** makes **repeat Gantt/Mermaid generation** economically viable for engaged users.

## Avatar levels ↔ skills tree (target)

**Today:** Offline skills gate on **generator ownership**, **coins**, and **skill prerequisites** — not yet on **per-avatar level**.

**Target:** `offline_skill_nodes` (or equivalent) carries optional **`minAvatarKey` + `minAvatarLevel`** (or branch mapping to an avatar). [`getOfflineSkillTree`](../server/storage.ts) / [`unlockOfflineSkill`](../server/storage.ts) enforce **avatar progression + coins + prereqs**. [`computeOfflineSkillEffects`](../server/storage.ts) (or related) reflects **better performance** (caps, rates, export quality) as avatars and skills level up.

## Phased implementation

| Phase | Deliverable |
|-------|-------------|
| **A** | This doc + roadmap links + [FLOWCHARTS.md](./FLOWCHARTS.md) alignment |
| **B1 (HIGH)** | **Gantt engine** + API + UI hook + Vitest for mapping logic |
| **B2** | `rewardsCatalog` + spend endpoints for **Gantt**, then **Mermaid** (higher price) |
| **C** | **Dispute event** model: agents → **Gantt attached to task** → **votes** → **awardCoins** |
| **D** | UI: dispute card, reorder/swap to match chart, tutorial copy |
| **E** | **Council / RAG-promoted avatar:** expiring task + vote **and/or** community A/B → promoted avatar **coin unlock** + **pay-agents** spend sink ([AGENT_ECOSYSTEM.md](./AGENT_ECOSYSTEM.md)) |

**Adjudication:** Prefer a server-stored **resolved order** (or hash) at event creation for deterministic “got it right” bonuses; document if you switch to pure consensus.

## Agent dispute → Gantt → coins (education loop)

Oppositional agents **argue** → system generates a **Gantt** → attach to a **task** → users **resolve ordering** (or swap tasks to match) → **participation coins** + **bonus for correct** → coins **unlock Gantt/Mermaid** after users have seen a **concrete use case**.

## Related

- [AGENT_ECOSYSTEM.md](./AGENT_ECOSYSTEM.md)
- [FLOWCHARTS.md](./FLOWCHARTS.md)
- [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md)
