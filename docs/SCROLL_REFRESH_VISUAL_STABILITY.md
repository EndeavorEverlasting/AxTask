# Scroll, refresh, and calm-mode visual stability

This document is the **handoff contract** for scroll-related flicker, hue flashes, and “content behind glass” bugs. Read it before changing Pretext shells, glass utilities, `animation-budget`, or long scrolling surfaces.

## Vocabulary

- **`data-axtask-calm`** — Attribute on `<body>` set by [`client/src/lib/animation-budget.ts`](../client/src/lib/animation-budget.ts) while scroll/longtask pauses are active. CSS in [`client/src/index.css`](../client/src/index.css) uses it to drop expensive compositor work (`backdrop-filter`, heavy `filter`, etc.).
- **Reader mask** — During calm, `.glass-panel*` (and `.axtask-calm-blur-fallback`) get an **opaque** `background-color` because blur is stripped; dark theme glass was otherwise nearly transparent and Pretext chips read through.
- **Calm release hysteresis** — After the scroll pause timer fires, calm stays on for a short extra window so `data-axtask-calm` does not flip on/off on every wheel edge (reduces perceived flash).

## Failure mode: “hue flash” on every scroll burst

**Symptom:** Panels or chrome **change colour subtly** when scrolling stops and starts, or ambient chips **pulse** against the UI.

**Root cause:** `data-axtask-calm` toggles while CSS switches between (a) resting frosted glass (translucency + blur) and (b) calm rules (no blur + opaque fill). If the resting and calm fills differ visibly, the swap reads as a flash. Historically, **`body[data-axtask-calm] .glass-panel { background-color: … !important }`** (see commit `2b1120c` and follow-ups) amplified this when toggled rapidly with **`DEFAULT_SCROLL_PAUSE_MS` (250)**.

**Mitigations in tree:**

1. **Chrome vs content split** — **Navigation** (`aside`, mobile `SheetContent`) uses **`.axtask-nav-chrome`** (opaque `var(--card)`) instead of `.glass-panel-glossy`, so the sidebar is **not** on the calm glass swap path over Pretext chips.
2. **Glass transitions** — Explicit `transition-property: background-color, backdrop-filter, …` on glass classes (not `transition-all`) smooths reader-mask entry where still needed.
3. **Chip layer** — Calm dims `.axtask-chip-layer` **without** animating opacity (opacity transition caused extra flash).
4. **Hysteresis** — `CALM_RELEASE_HYSTERESIS_MS` extends calm briefly after the scroll pause timer so attribute churn is lower.

## Failure mode: Task Timeline / Gantt distorted text

**Symptom:** Axis date labels look **stretched, huge, or overlapping**.

**Root cause:** SVG **`preserveAspectRatio="none"`** scales X and Y independently to the CSS box; **`<text>` distorts** with non-uniform scale.

**Mitigation:** [`client/src/components/task-gantt.tsx`](../client/src/components/task-gantt.tsx) uses **`preserveAspectRatio="xMidYMid meet"`** and a wrapper **`aspectRatio: 100 / svgHeight`** so the viewBox keeps a uniform scale.

## When you change UI

- **New reader surfaces:** Prefer `.glass-panel` / `.axtask-calm-blur-fallback` patterns from this doc; avoid bare `backdrop-blur-*` on huge translucent fills over the aurora without a calm fallback.
- **New chrome (nav, rails, drawers):** Prefer **`.axtask-nav-chrome`** or another **opaque** shell, not glass, if the element sits over Pretext ambient layers.
- **Scroll containers:** Call **`notifyScrollBudget()`** from app scroll roots so calm-mode matches real user scroll (see [`client/src/App.tsx`](../client/src/App.tsx), sidebar).

## Verification

- `npm run check`
- `npx vitest run client/src/index.calm-mode.contract.test.ts client/src/lib/animation-budget.test.ts client/src/components/task-gantt.test.ts`
- Manual: scroll planner and rewards with dark theme; confirm no rapid hue pulse on nav; confirm Gantt axis labels stay readable.
