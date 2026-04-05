# Zero-trust posture and privacy

AxTask is **open source (MIT)** and aims for **zero-trust-friendly** operations: assume networks and hosts are hostile, minimize blast radius, and avoid forcing operators to routinely read end-user content.

## Admin and operator boundaries

- Prefer **role-scoped access**, **audit logs**, and **break-glass** procedures documented in [SECURITY.md](./SECURITY.md).
- **Aggregation by default:** dashboards and admin tools should emphasize **category-level** or **statistical** views (activity classes, mood buckets, coarse circumstance tags) rather than raw notes or PII.
- **Engine observability** ([ENGINES.md](./ENGINES.md)): record *which* engine acted and *what class* of event occurred without storing unnecessary plaintext in security tooling.

## User data minimization

- Task content may include sensitive notes. Product direction: derive **categories of activity**, **moods**, and **general circumstances** for analytics where possible, with clear retention and export/delete policies as features mature.
- **Location** (planned): use permissioned geolocation and **place clustering** / fuzzy identifiers; document retention alongside tasks.

## Philosophy tension: community verification

Some features **require identifiable data** (for example **18+ verification** or **ID OCR** for community trust). That **conflicts** with a strict “admin never sees user-specific data” stance.

**Documented dual posture:**

1. **Default:** anonymized / aggregate operator views and encrypted-at-rest storage where feasible.
2. **Opt-in verified surface:** users who choose a **public verified profile** accept stronger identity processing (e.g. ephemeral OCR on a **temporary** page, **no long-term ID image** storage if that is the policy). Operators still follow least privilege and legal process—not routine browsing of feeds.

Details belong in future `COMMUNITY_MODERATION.md` and privacy policy copy.

## Community moderation and retention

For **comment deletion**, **abuse**, and **legal follow-up**, prefer an **append-only moderation audit** (actor id, target id, action, timestamp; content may be redacted or hashed per policy) instead of relying only on volatile client-side listeners. Jurisdiction-specific legal review is required before final retention rules.

See [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md) and (when implemented) [COMMUNITY_MODERATION.md](./COMMUNITY_MODERATION.md).
