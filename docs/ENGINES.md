# Engines Architecture

## Overview
AxTask relies on numerous background worker processes and specialized engines to drive complex behaviors beyond typical CRUD logic.

### Known Engines
1. **Gamification & Rewards Engine** — **Partial**
   - `AxCoin` awards, daily caps, and wallet ledger are implemented.
   - Avatar profiles, skill trees, and unlock/upgrade mechanics are live.
   - Advanced mechanics (six-slot entourage marketplace, adversary encounters) are architectural only.
   - `archetype_signal` recording exists; empathy rollup/markov analytics are implemented at the data layer.
2. **Billing Bridge Engine** — **Implemented**
   - The `tools/billing_bridge` Python CLI parses external evidence ledgers and matches them with `AxTask` task/attendance tables.
   - Web UI and API routes (`/api/billing-bridge/*`) are wired and functional when the CLI and config files are present.
3. **Location & Reminders Engine** — **Partial**
   - `user_location_places`, `user_location_events`, and `user_reminders` schemas and REST routes exist.
   - In-app/datetime reminder creation and trigger dispatch are implemented.
   - Native OS notification bridges (Windows Notification Center, macOS Calendar/Reminder, Linux `notify-send`) are planned but not yet wired.
4. **Community Engine** — **Partial**
   - Public posts, replies, momentum stats, content moderation, and age-gating are live.
   - Public profiles and feed unification remain uneven; see [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md).
5. **NodeWeaver Integration** — **Implemented (client); vendored upstream pending**
   - The AxTask server has a live HTTP client (`server/services/classification/nodeweaver-client.ts`) and fallback orchestration.
   - The vendored `services/nodeweaver/upstream` source tree is not yet populated in this repository; use external service mode or sync from the NodeWeaver release source.
6. **Foundry** — **Implemented**
   - Admin-only git-status collector and run-log appender (`foundry_run_logs`) with MFA step-up.
7. **Gentle Reminder / Native Notification Bridge** — **Planned**
   - No native OS notification integration yet. Current reminders are server-scheduled or browser push only.

## Guidelines
- Changes to engine logic must be accompanied by unit or integration tests that assert stable progression states.
- Performance regressions in engines (e.g. latency spikes) directly fail CI budgets (e.g. `npm run perf:api-replay`).
