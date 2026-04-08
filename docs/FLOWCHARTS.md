# User flowcharts and diagram exports (planned)

**Goal:** Let users generate **flowcharts** and **schedules** from task dependencies, dates, and metadata.

## Priority and economics

- **Gantt chart generation** is **high priority** — implement a **task/schedule → Gantt** pipeline first (see [PRODUCTIVITY_ARTIFACTS.md](./PRODUCTIVITY_ARTIFACTS.md)).
- **Mermaid** export (flowchart, sequence, or gantt syntax) is intended as a **premium** tier vs **Gantt**: **higher coin cost** in `rewards_catalog` once both exist.
- **Engagement:** combine **coin spend** with **tutorial / dispute** flows so users see **why** diagrams matter before unlimited free export.

## Implementation checklist (keep in sync with PRODUCTIVITY_ARTIFACTS)

1. **B1:** Server-side Gantt builder + authenticated download or attach-to-task API + unit tests.
2. **B2:** Coin-gated export redemption (Gantt cheaper, Mermaid more expensive).
3. **C–D:** Agent dispute UI using the same Gantt engine.
4. Optional: interactive graph UI later; Mermaid remains a strong **export** format.

Track roadmap rows in [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md).
