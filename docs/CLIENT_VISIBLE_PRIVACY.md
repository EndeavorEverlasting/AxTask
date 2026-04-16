# Client-visible data and privacy

Anything the browser receives for a signed-in session can be inspected in **DevTools (Network and Console)** by the account holder, extensions, or anyone with access to the device. Treat the main SPA API surface as **not a private channel**.

## Principles

1. **Least data in JSON** — Return only fields the UI needs. Prefer explicit serializers (see `shared/public-client-dtos.ts`) over sending full ORM rows.
2. **No secrets in client bundles** — Do not `console.log` responses, tokens, or full user/task objects in production builds; use `import.meta.env.DEV` when debugging.
3. **Server logs** — Access logs must not append full `res.json` bodies; operational detail belongs in structured, access-controlled logging if required.

## Primary SPA surfaces (inventory)

High-traffic JSON paths used by the main app include: `GET /api/tasks` (and search/status variants), `PUT /api/tasks/:id`, `GET /api/gamification/wallet`, `GET /api/gamification/transactions`, `GET /api/gamification/profile`, `GET /api/auth/me`, and account TOTP/phone flows. When extending behavior, decide per field whether it belongs in the browser at all.

## Examples in this repo

- `GET /api/auth/me`, login, register, and TOTP success responses use **`toPublicSessionUser`** (no security-question text or ban metadata in the session payload).
- `GET /api/gamification/wallet` returns **`toPublicWallet`** (no redundant `userId`).
- `GET /api/gamification/transactions` (and bundled profile) uses **`toPublicCoinTransactions`**, which drops `userId` and redacts `details` for billing/payment-like reasons.

When adding endpoints, extend serializers and add tests under `shared/public-client-dtos.test.ts` or a contract test rather than widening accidental exposure.
