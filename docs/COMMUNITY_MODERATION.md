# Community moderation (planned)

**Scope:** Comments, feeds, profiles, **rate limits**, **delete** flows, **undo/redo** where applicable, and **audit** retention for abuse and legal follow-up.

## Principles (draft)

- **Separate from billing** — community APIs and DTOs must not be mixed with `/api/billing/*`.
- **Append-only audit** recommended for destructive actions (actor, target, timestamp; content may be redacted per policy). See [ZERO_TRUST_AND_PRIVACY.md](./ZERO_TRUST_AND_PRIVACY.md).

Expand this file when community schema and routes land. See [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md).
