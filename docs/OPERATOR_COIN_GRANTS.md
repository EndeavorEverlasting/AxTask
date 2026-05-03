# Operator policy: AxCoin grants (owner-only)

Internal reference for how **discretionary coin credits** are allowed in AxTask, why they are **not** exposed as a general admin power, and how to use the API safely.

## Principle

Granting coins **creates currency** in the engagement economy. Used without discipline, it **dilutes** rewards for users who earn coins through tasks, classification, streaks, and shop trade-offs. The product stance is:

- **Permitted:** Rare, justified credits (e.g. make-good for a verified bug, goodwill for a specific incident, owner discretion when aligned with product values).
- **Not permitted as a standing feature:** A broad **“admin grant coins”** control tied only to `role === "admin"`, which could be abused if an account with admin access is compromised or misused.

Fairness is enforced by **narrow authorization**, **auditability**, and **operational restraint**—not by pretending manual grants never happen.

## What the code does

| Mechanism | Detail |
|-----------|--------|
| **Endpoint** | `POST /api/gamification/owner/grant-coins` (authenticated). |
| **Authorization** | Caller’s user id must appear in env **`OWNER_COIN_GRANT_USER_IDS`** (comma-separated UUIDs). **Not** keyed on admin role alone. |
| **Body** | `targetUserId` (UUID), `amount` (positive integer, capped), optional `note` (max 500 chars). |
| **Ledger** | Credits use coin transaction reason **`owner_coin_grant`** via [`ownerGrantCoinsToUser`](server/storage.ts). |
| **Audit** | Each success calls **`logSecurityEvent("owner_coin_grant", …)`** with granter id, target id, IP, and details string including amount and note. |
| **Client exposure** | Responses use public DTO patterns where applicable; do not log raw grant payloads in access logs (see [CLIENT_VISIBLE_PRIVACY.md](CLIENT_VISIBLE_PRIVACY.md)). |

Non-allowlisted callers receive **404** (`Not found`) to avoid advertising the capability.

## Operator checklist before granting

1. **Confirm identity** of the target account (support ticket, internal request).
2. **Pick the smallest reasonable amount**; document why in `note`.
3. **Prefer** compensating through in-product flows when possible (future product decisions may add automated refunds).
4. **After deploy changes** to rewards/coins behavior, run [OBJECTIVE_CODE_PUSH_CHECKLIST.md](OBJECTIVE_CODE_PUSH_CHECKLIST.md) when applicable.

## Configuration

Set **`OWNER_COIN_GRANT_USER_IDS`** in the **server** environment (e.g. Render env for production, `.env` for local experimentation). Only listed user ids can call the endpoint.

## Related

- Pre-push objectives when touching coins/rewards: [OBJECTIVE_CODE_PUSH_CHECKLIST.md](OBJECTIVE_CODE_PUSH_CHECKLIST.md)
- Agent-facing summary: [AGENTS.md](../AGENTS.md)
