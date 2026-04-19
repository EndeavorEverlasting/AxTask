# AxTask performance budgets

Single source of truth for the performance numbers enforced in CI. If you
change one, change the corresponding test/fixture in the same commit and
record the reason in the PR body.

## Client — bundle size

Enforced by `npm run perf:bundle`
(`tools/perf/bundle-budget.mjs`), run in the
`test-and-attest` workflow after `npm run build`.

| Budget                      | Default           | Env override                        | Severity |
| --------------------------- | ----------------- | ----------------------------------- | -------- |
| Largest JS chunk            | 900,000 B         | `AXTASK_MAX_MAIN_CHUNK_BYTES`       | Hard fail |
| Total JS across all chunks  | 4,500,000 B       | `AXTASK_MAX_TOTAL_JS_BYTES`         | Hard fail |
| Per-chunk soft ceilings     | see `SOFT_CHUNK_CEILINGS` in the script | `AXTASK_STRICT_CHUNKS=1` promotes to fail | **Hard fail in CI** (strict mode is on) |

The defaults were ratcheted in `perf/pass-3-sprint` after measuring a fresh
production build (main chunk 422 KB, total 2.49 MB). They keep ~2x headroom
over measured sizes so normal growth lands cleanly, while a silent static
import of a heavy vendor into the main chunk will fail the build. The CI
workflow sets `AXTASK_STRICT_CHUNKS=1` so per-chunk ceilings are also
enforced.

## Client — surface resource accounting

Enforced by `PerfLedger`
(`client/src/lib/perf-ledger.ts`) and surfaced in the
admin Performance tab via `SurfaceResourceTable`. These are observational
(no CI gate yet) but give a reproducible way to spot regressions before they
reach the runtime heuristics.

- Every React subtree that owns a scroll container or a list tags itself
  with `usePerfSurface("<name>")`. That attaches `data-axtask-surface` to
  the DOM node and emits `mount` + `render` marks.
- `LongTaskAttributor` listens to `PerformanceObserver("longtask")` and
  attributes each longtask to the largest on-screen surface.
- `SurfaceResourceTable` shows per-surface mount count, render p95, total
  ms, long-task ms, and max row count inside the admin panel. The table
  supports freezing the snapshot so you can compare before/after a scroll.

## Client — animation budget

Enforced at runtime by `animation-budget.ts`
(`client/src/lib/animation-budget.ts`). Ambient rAF loops (orbs, coin
count-ups, chips) subscribe to the shared budget and pause when:

- `prefers-reduced-motion: reduce` is true (permanent pause)
- The tab is hidden
- A `scroll` event fires anywhere on the window (250 ms tail)
- A longtask is observed (400 ms tail)

The budget also mirrors its state onto `body[data-axtask-calm]`, which a
single CSS rule in `index.css` uses to drop
`backdrop-filter` and `transition-all` for the duration of the pause.
This is how we stop glass panels from re-compositing on scroll without
deleting the glass treatment when the UI is idle.

## Server — API latency heuristics

Enforced by `npm run perf:api-replay` (run in
`test-and-attest`). Replays a JSON fixture of `api_request` security
events through the pure functions in
`server/monitoring/api-performance-heuristics.ts`
and fails if any `critical`-severity signal is emitted.

| Signal                    | Trigger                                                    | Severity  |
| ------------------------- | ---------------------------------------------------------- | --------- |
| `tasks_list_latency`      | `GET /api/tasks` p95 ≥ 600 ms with ≥ 12 samples            | warning, promoted to critical at 2,500 ms |
| `slow_route`              | any route p95 ≥ 2,500 ms with ≥ 5 samples                  | warning |
| `mutation_latency`        | `POST`/`PUT`/`PATCH`/`DELETE` p95 ≥ 1,500 ms with ≥ 8 samples | warning |
| `elevated_server_errors`  | 5xx rate ≥ 4% over ≥ 25 samples                            | critical |

Fixtures live in `tools/perf/fixtures/`:

- `api-replay-baseline.json` — known-good production-shaped window
- `api-replay-regression.json` — known-bad window used by the unit test

Change thresholds only in tandem with the baseline fixture and a note in
the PR explaining why the new floor is sustainable.

## React Query defaults

Enforced by `client/src/lib/queryClient.defaults.test.ts`.
Defaults are:

- `refetchOnWindowFocus: false` — tab-focus refetch caused perceptible
  jank (scroll interruptions, markdown re-parse). Opt in per-query.
- `refetchInterval: false` — long-running background polling drains main
  thread and DB. Opt in per-query with a justified interval. Current
  opt-ins are:
  - `sidebar.tsx` — 60 s briefing, 30 s wallet
  - `adherence-nudges.tsx` — 60 s
  - `planner.tsx` — 60 s / 120 s
  - admin surfaces (`admin.tsx`, `db-size-card.tsx`,
    `storage/*`) — 15 s / 60 s / 5 min, gated by
    `adminApiEnabled` so polling only runs while an admin is looking at
    the panel.

## How budgets flow into CI

```
┌────────────────────────────────────────────────────────────┐
│  .github/workflows/test-and-attest.yml (pull_request/push) │
│                                                            │
│   npm run check           — typecheck                      │
│   npm test                — unit + contract + deploy tests │
│   npm run build           — Vite production build          │
│   npm run perf:bundle     — client bundle budgets          │
│   npm run perf:api-replay — API latency heuristics gate    │
└────────────────────────────────────────────────────────────┘
```

Any budget failure blocks the PR. Tightening a budget (i.e. making it
stricter) requires bumping its fixture / test so the new floor is
provably sustainable; loosening a budget requires an operator-visible
note explaining the trade-off.
