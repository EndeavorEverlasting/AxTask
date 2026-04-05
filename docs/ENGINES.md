# Engine orchestration

AxTask automates work through **small, testable engines** and a **dispatcher** router—similar in spirit to agent / sub-agent boundaries: narrow contracts, explicit failure handling, and no silent cross-wiring between unrelated domains.

## Dispatcher (natural language and voice)

- **File:** [`server/engines/dispatcher.ts`](../server/engines/dispatcher.ts)
- **Role:** Classifies user intent (`task_create`, `planner_query`, `calendar_command`, `task_review`, etc.) and delegates to the right engine.
- **Registration:** New NL intents belong in one place (`INTENT_PATTERNS`) with priority ordering.

## Specialized engines (today)

| Engine | File | Role |
|--------|------|------|
| Calendar | `calendar-engine.ts` | Natural language → structured calendar commands. |
| Planner | `planner-engine.ts` | Queries over tasks / priorities. |
| Review | `review-engine.ts` | Completion / bulk review flows. |
| Feedback | `feedback-engine.ts` | Feedback inbox processing. |
| Pattern | `pattern-engine.ts` | Task history / pattern insights (NodeWeaver-related). |
| **Billing summary** | `billing-summary-engine.ts` | **Account plane** read model for `/billing` (subscriptions + invoices + payment methods only). |

## Product planes (do not conflate)

- **Account plane:** Billing, subscription state, invoices, billing profile. Engines here must **not** pull community or task-feed data.
- **Core — tasks:** Dispatcher, calendar, planner, review, attachments, etc.
- **Core — NodeWeaver:** Classification / pattern intelligence (`pattern-engine` and related).
- **Core — community:** (Planned) Feeds, moderation, verification—**separate** routes and DTOs from billing.

## Principles

1. **One responsibility per engine.**
2. **Typed inputs/outputs**; use Zod at HTTP boundaries.
3. **Idempotency and audit** where money or security events are involved (`idempotencyKeys`, `invoice_events`, `security_events`).
4. **Observability:** record which engine ran when persisting side effects; avoid funneling raw user content into admin tools (see [ZERO_TRUST_AND_PRIVACY.md](./ZERO_TRUST_AND_PRIVACY.md)).

## Adding an engine

1. Implement a pure-ish module under `server/engines/` with explicit types.
2. If NL-triggered, extend `dispatcher.ts` with patterns and a handler branch.
3. If HTTP-triggered, add routes in `server/routes.ts` (or a dedicated router) and tests.
4. Document the engine in this file and, if user-visible, in [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md).
