# AxTask product roadmap

**Start here after `git clone`.** This file is the canonical checklist for vision, phases, and doc deep-links. **Billing is the account plane**; when the account is **active**, **core** includes **tasks**, **NodeWeaver (classification)**, and **community**—as separate modules.

## Documentation map

| Document | Purpose |
|----------|---------|
| [SIGN_IN.md](./SIGN_IN.md) | How users sign in (prod, Docker, local dev); no operator secrets |
| [internal/README.md](./internal/README.md) | Operator runbook location; template vs gitignored copy |
| [internal/OPERATOR_RUNBOOK.template.md](./internal/OPERATOR_RUNBOOK.template.md) | Admin grant, `/admin`, dev seeds, local testing steps |
| [BILLING_UI.md](./BILLING_UI.md) | `/billing` layout and APIs |
| [ENGINES.md](./ENGINES.md) | Dispatcher + engines; account vs core |
| [ZERO_TRUST_AND_PRIVACY.md](./ZERO_TRUST_AND_PRIVACY.md) | Admin boundaries, aggregates, ID tension |
| [TYPESCRIPT_BASELINE.md](./TYPESCRIPT_BASELINE.md) | `npm run check` server debt |
| [SPREADSHEET_TEMPLATE_UX.md](./SPREADSHEET_TEMPLATE_UX.md) | Top entry zone, embedded formulas vs Apps Script, sync phases |
| [CALENDAR_SYNC.md](./CALENDAR_SYNC.md) | External calendar sync (planned) |
| [COMMUNITY_MODERATION.md](./COMMUNITY_MODERATION.md) | Community moderation policy and operator workflow |
| [FLOWCHARTS.md](./FLOWCHARTS.md) | Gantt (priority) + Mermaid / flow exports; coin tiers |
| [AGENT_ECOSYSTEM.md](./AGENT_ECOSYSTEM.md) | Multi-agent vision: entourage vs systemic agents, council, RAG promotion |
| [PRODUCTIVITY_ARTIFACTS.md](./PRODUCTIVITY_ARTIFACTS.md) | Coins, offline generator, exports, disputes, avatar↔skills target |
| [BRANDING.md](./BRANDING.md) | Logo / favicon paths |
| [VERSION_1.3.0_PLAN.md](./VERSION_1.3.0_PLAN.md) | Soft delete, recycle bin, DnD, etc. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture |
| [SECURITY.md](./SECURITY.md) · [SECURITY_TECHNICAL_REFERENCE.md](./SECURITY_TECHNICAL_REFERENCE.md) | Public policy vs technical reference |

## Roadmap triage (funnel metrics + JTBD)

Use this **once per month** (or before a release) so backlog order reflects real usage, not guesswork.

### Core funnel signals

Server and client record rows in `product_funnel_events` (see `GET /api/admin/funnel-events/summary` for aggregates). **`npm run db:push`** (and Docker `migrate`) already run numbered SQL under [`migrations/`](../migrations/) before `drizzle-kit push`, including [`0004_product_funnel_events.sql`](../migrations/0004_product_funnel_events.sql); manual `psql -f` is optional. Canonical event names:

| Event | Meaning |
|-------|--------|
| `task_created` | User created a task via API |
| `task_completed` | Task moved to `completed` |
| `spreadsheet_import_batch` | Spreadsheet bulk import finished with ≥1 row inserted |
| `user_backup_import` | Self-service JSON backup import applied (not dry-run) |
| `community_task_published` | Task published to community after MFA |
| `voice_dispatch` | Voice command processed (see `meta.intent`) |
| `planner_viewed` | Planner surface opened (session-scoped client beacon) |
| `community_feed_viewed` | Community feed page opened (session-scoped client beacon) |

**How to use:** Compare volumes and week-over-week trends. Large **traffic but low downstream** (e.g. many `planner_viewed` but few `task_completed`) suggests UX or value gaps on that surface. Cross-check with support/feedback tags.

### Five-question JTBD interview (repeat monthly with ~5 users)

1. When you last **felt overwhelmed** by work, what did you do **before** opening AxTask (calendar, notes, email, spreadsheet)?
2. What **job** did you hire AxTask to do that day (capture, prioritize, not forget, report, gamify, collaborate)?
3. What **almost made you quit** the session (bugs, confusion, missing export, wrong priority)?
4. What would have to be true for AxTask to be your **default** for that job?
5. If you could **remove one feature** to simplify the product, what would it be?

Summarize answers into themes; map themes to master table rows below. If interviews contradict the current order, **re-rank the suggested execution list** before coding.

### Suggested execution order (default until metrics say otherwise)

This is **not** a replacement for the traceability table; it is the **recommended build order** when you have no stronger signal yet:

1. **Journey completeness** — Community feed in-app (`/community`), publish flow, moderation readiness ([COMMUNITY_MODERATION.md](./COMMUNITY_MODERATION.md)); row 10a.
2. **Trust + data safety** — Soft delete / recycle bin / undo ([VERSION_1.3.0_PLAN.md](./VERSION_1.3.0_PLAN.md)); row 13.
3. **Core scheduling UX** — Calendar DnD on day / week / month views ([VERSION_1.3.0_PLAN.md](./VERSION_1.3.0_PLAN.md)).
4. **Retention with external calendars** — Google / Microsoft sync ([CALENDAR_SYNC.md](./CALENDAR_SYNC.md)); row 7.
5. **Differentiated outputs** — Gantt / Mermaid / flow exports ([FLOWCHARTS.md](./FLOWCHARTS.md)); rows 6, 17.
6. **Spreadsheet power users** — Top entry band templates ([SPREADSHEET_TEMPLATE_UX.md](./SPREADSHEET_TEMPLATE_UX.md)); row 7b.
7. **Privacy / advanced community** — Rows 9, 10b, 11 as legal/product posture matures.
8. **Ongoing** — Rows 1–4, 14–16 (security, cache, engines, TypeScript baseline).

After each triage cycle, adjust this list and add a one-line note in [VERSION_1.3.0_PLAN.md](./VERSION_1.3.0_PLAN.md) if v1.3 scope shifts.

## Master traceability (original vision)

| # | Theme | Direction | Docs / code |
|---|--------|-----------|-------------|
| 1 | Open source + **zero-trust** | MIT license; threat model, least privilege, audit. | [SECURITY.md](./SECURITY.md), [SECURITY_TECHNICAL_REFERENCE.md](./SECURITY_TECHNICAL_REFERENCE.md), [ZERO_TRUST_AND_PRIVACY.md](./ZERO_TRUST_AND_PRIVACY.md), [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 2 | **Anonymize** operator views; **category** activity / mood / circumstance | Aggregation layer; optional client-side enrichment; admin aggregates. | [ZERO_TRUST_AND_PRIVACY.md](./ZERO_TRUST_AND_PRIVACY.md), future schema |
| 3 | **Sophisticated cache** | TanStack persist, offline phases A–C, SW; tiers / invalidation / optional Redis later. | [OFFLINE_PHASE_A.md](./OFFLINE_PHASE_A.md), [OFFLINE_PHASE_C.md](./OFFLINE_PHASE_C.md), [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 4 | **User cache toggle** | Setting gates persisted query cache; clear on off. | `client/src/lib/query-persist-policy.ts` |
| 5 | **Billing page** | Screenshot-style `/billing`; MFA; non-PCI fingerprints. | [BILLING_UI.md](./BILLING_UI.md) |
| 6 | **Flowcharts** for users | Task dependency / workflow diagrams, export. | [FLOWCHARTS.md](./FLOWCHARTS.md) |
| 7 | **Google / Windows (Microsoft) calendar sync** | OAuth, sync engine, notifications. | [CALENDAR_SYNC.md](./CALENDAR_SYNC.md) |
| 7b | **Spreadsheet templates** (top entry UI, embedded IDs/dates, less Apps Script) | Generated Sheets/Excel with **frozen entry band** at top, **log below**; formulas for dates/IDs; optional clasp script. | [SPREADSHEET_TEMPLATE_UX.md](./SPREADSHEET_TEMPLATE_UX.md), [`server/google-sheets-api.ts`](../server/google-sheets-api.ts) |
| 8 | **Favicon / logo** | Brand assets and HTML entry. | [`client/index.html`](../client/index.html), [BRANDING.md](./BRANDING.md) |
| 9 | **Location** + repeated places | Geolocation consent, place keys, privacy. | [ZERO_TRUST_AND_PRIVACY.md](./ZERO_TRUST_AND_PRIVACY.md), Tasks track |
| 10a | **Community** deletes, abuse, **rate limits** | Soft delete / tombstone; moderation engine. | [COMMUNITY_MODERATION.md](./COMMUNITY_MODERATION.md) (planned sections) |
| 10b | **Retention** for malpractice | Append-only moderation audit vs discard—legal review. | [ZERO_TRUST_AND_PRIVACY.md](./ZERO_TRUST_AND_PRIVACY.md), [COMMUNITY_MODERATION.md](./COMMUNITY_MODERATION.md) |
| 11 | **18+ profiles**, feed, analytics, **ephemeral ID OCR** | Dual posture with row 2; tesseract.js available. | [ZERO_TRUST_AND_PRIVACY.md](./ZERO_TRUST_AND_PRIVACY.md), Community track |
| 12 | **Avatar** + **PreText** | Aggregates for generation; `pretext-layout.ts` for UI metrics. | `client/src/lib/pretext-layout.ts` |
| 13 | **Redo / undo** | Soft delete + recycle bin; extend to community. | [VERSION_1.3.0_PLAN.md](./VERSION_1.3.0_PLAN.md) |
| 14 | **`npm run check`** baseline | No new errors in `client/`; server debt listed. | [TYPESCRIPT_BASELINE.md](./TYPESCRIPT_BASELINE.md) |
| 15 | **README branding** | Canonical **AxTask** naming + subtitle. | [README.md](../README.md), [BRANDING.md](./BRANDING.md) |
| 16 | **Engines** | Dispatcher + per-plane engines. | [ENGINES.md](./ENGINES.md) |
| 17 | **Agent disputes + productivity exports** | Gantt engine first; Mermaid premium; steady generator cadence; optional council / vote / coin unlock ([PRODUCTIVITY_ARTIFACTS.md](./PRODUCTIVITY_ARTIFACTS.md), [AGENT_ECOSYSTEM.md](./AGENT_ECOSYSTEM.md)). | [FLOWCHARTS.md](./FLOWCHARTS.md), gamification routes in `server/routes.ts` |

## Ship protocol

1. `npm run test` and `npm run check` (and `npm run deps:check` if deps changed).
2. Fix regressions; update [TYPESCRIPT_BASELINE.md](./TYPESCRIPT_BASELINE.md) if only pre-existing server `tsc` issues remain.
3. `git commit` with a clear message; `git push` (and PR as usual).

Do not push with failing tests unless an explicit exception is documented.
