# Agent ecosystem (vision)

AxTask treats **agents** broadly: some appear as **Rewards / entourage** companions; others are **systemic** (security, orchestration, tutorials, small helpers). Agents are meant to **complement each other**, not compete for a single UI slot.

## Functional / system agents

- **Override / authority** — Policy, caps, and explicit precedence when agents disagree or outcomes could harm the user or violate rules.
- **Security agent** — Guides users through the app **securely and immersively**: tutorials, protocols, and reminders (separate from mood companions).
- **Composer agents** — Facilitate **user objectives**: breaking down work, drafting, sequencing.
- **Helper agents** — Small capabilities that make the rest of the experience possible (utilities, glue, nudges).

## Personality / mood agents

Examples: **happy**, **gloomy**, **funny**, **angry**, **confident**, **timid**, **serious / stoic**, **open-minded**, **close-minded**.

- **Kick back / meditate / life advice / enjoy life** — Aligns with the **lazy** entourage lane in product copy. Implementation detail: rest-oriented phrases (including **“kick back”**, chill, take a break) feed **lazy avatar XP** via [`server/services/gamification/lazy-avatar-xp.ts`](../server/services/gamification/lazy-avatar-xp.ts).
- **Oppositional / competitive / “sheisty” / jealous** — Clash with each other and spawn **side quests, disputes, and votes**. See [PRODUCTIVITY_ARTIFACTS.md](./PRODUCTIVITY_ARTIFACTS.md) for **Gantt-on-task** dispute loops and coin rewards.
- **ADHD agent** — Structured **tangents** (creative or practical) that help rather than derail.

## Cross-agent outcomes → user constitution

Interactions produce **events and tasks** users resolve; **votes and outcomes** feed a **multi-modal archetype / constitution** over time.

**NodeWeaver** ([`server/services/classification/nodeweaver-client.ts`](../server/services/classification/nodeweaver-client.ts)) enriches signals from **text and behavior**; not every agent is a separate NodeWeaver mode, but **classification metadata** can absorb dispute and resolution text where useful.

## RAG and evolution

RAG-backed flows can introduce **parameters we did not ship on day one** and support **calibration / training sessions** that improve AxTask over time. Treat this as a **phased** product/engineering track, not a single release.

## RAG-suggested avatar promotion (“council”)

When usage shows an **agent or behavior** deserves a real entourage slot, the system may propose a **new avatar candidate**.

1. Existing avatars hold a **council**: deliberation content is published as a **time-bound task** (with **expiration**) and a **user vote**.
2. **A/B:** run the same vote through a **community-oriented surface** (e.g. community-published task or future post type) and compare engagement. **Deprecation is easier than creation:** soft-launch with **catalog flags** before hard schema commitment.
3. If users vote **yes**, the avatar is **promoted**; users **unlock** it by **spending coins** (not automatic).
4. **Coin sink — “pay agents”:** optional spend to acknowledge **agent labor** (flavor ± small mechanical benefit), recorded in **`coin_transactions`** with explicit reason keys (e.g. `agent_tribute`, `council_tip`) for analytics.

## Related docs

- [PRODUCTIVITY_ARTIFACTS.md](./PRODUCTIVITY_ARTIFACTS.md) — Gantt/Mermaid economics, offline generator, avatar ↔ skills tree, dispute phases.
- [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md) — Master checklist and doc map.
- [FLOWCHARTS.md](./FLOWCHARTS.md) — Planned Mermaid / diagram exports (premium vs Gantt).
