# Replit → Neon data merge (operational runbook)

Use this when moving **your** historical data from a Replit-hosted Postgres into the current production database (e.g. Neon on Render) **without** bypassing import dedupe or coin-ledger rules.

## 1. Map user IDs (local notes only)

1. **Source (Replit):** In the Replit SQL tool or `psql` with the Replit `DATABASE_URL`, run:

   ```sql
   SELECT id, email, role FROM users WHERE email = 'your@email';
   ```

   Record **`SOURCE_USER_ID`**.

2. **Target (Neon):** Same query against production. Record **`TARGET_USER_ID`**.

3. Store both in a **local** password manager or gitignored notes. **Never** commit `DATABASE_URL` or these IDs to the repo.

## 2. Export JSON from Replit

1. Sign in on **axtask.replit.app** (or your Replit URL).
2. Open **Import / Export**.
3. In **production**, request the email code and complete step-up (same flow as production).
4. **Download JSON backup** (`GET /api/account/export`).

The file includes tasks (importable), wallet snapshot (informational only), and badge ids. **Wallet balances are not applied on import** — coins stay consistent with [`addCoins` / `spendCoins`](../server/storage.ts) only.

## 3. Import into Neon (same human, new `users.id`)

1. Sign in on the **target** host (e.g. axtask.app) as the same person.
2. Complete email step-up on Import/Export.
3. Upload the JSON backup.
4. Run **Dry run**, then **Import**.

Imports use **`POST /api/account/import`** with the same **task fingerprint** dedupe as [`POST /api/tasks/import`](../server/routes.ts): duplicate logical tasks are skipped, not double-counted for coins.

## 4. Wallet / AxCoins policy

- **No** raw `COPY` of `wallets` or `coin_transactions` from Replit for your live user.
- After tasks are imported, balances may differ from Replit until completions are replayed through product logic. Optional: a one-off **audited** adjustment via `addCoins` with a dedicated `reason` and security event (ops-only).

## 5. Verify ledger (post-merge)

Run in Neon SQL editor:

- See [`sql/ops/verify-wallet-ledger.sql`](../sql/ops/verify-wallet-ledger.sql).

Spot-check task totals vs. the source dashboard.

## 6. Large backups (~10k tasks)

- Single import supports up to **50,000** new tasks per request (same as bulk task import).
- If you hit **storage policy** max task count, raise the limit for that user (admin) or archive tasks before import.
