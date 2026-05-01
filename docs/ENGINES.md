# Engines Architecture

## Overview
AxTask relies on numerous background worker processes and specialized engines to drive complex behaviors beyond typical CRUD logic.

### Known Engines
1. **Gamification & Rewards Engine**
   - Distributes `AxCoin` based on task completion and participation.
   - Powers the multi-slot entourage model (avatars & skill tree progression).
   - Generates and resolves `archetype_signal` into the `security_events` table for empathy scores.
2. **Billing Bridge Engine**
   - The `tools/billing_bridge` CLI parses external evidence ledgers and matches them with `AxTask` task/attendance tables.
   - Normalizes metadata (extracts PM, aligns formatting) for reporting.
3. **Location & Reminders Engine**
   - Dispatches geofence entry/exit rules.
   - Integrates with the `user_location_events` and `user_reminders` tables to trigger local push or in-app alerts.
4. **Community Engine**
   - Translates human signals and avatar personas into generalized forum content (`community_posts`, `community_replies`).
   - Integrates age-gating rules securely.

## Guidelines
- Changes to engine logic must be accompanied by unit or integration tests that assert stable progression states.
- Performance regressions in engines (e.g. latency spikes) directly fail CI budgets (e.g. `npm run perf:api-replay`).
