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
| COMMUNITY_MODERATION.md (planned) | Community moderation; doc not added to the repo yet |
| [FLOWCHARTS.md](./FLOWCHARTS.md) | User flowcharts (planned) |
| [BRANDING.md](./BRANDING.md) | Logo / favicon paths |
| [VERSION_1.3.0_PLAN.md](./VERSION_1.3.0_PLAN.md) | Soft delete, recycle bin, DnD, etc. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture |
| [SECURITY.md](./SECURITY.md) · [SECURITY_TECHNICAL_REFERENCE.md](./SECURITY_TECHNICAL_REFERENCE.md) | Public policy vs technical reference |

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

## Ship protocol

1. `npm run test` and `npm run check` (and `npm run deps:check` if deps changed).
2. Fix regressions; update [TYPESCRIPT_BASELINE.md](./TYPESCRIPT_BASELINE.md) if only pre-existing server `tsc` issues remain.
3. `git commit` with a clear message; `git push` (and PR as usual).

Do not push with failing tests unless an explicit exception is documented.
