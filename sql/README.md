# SQL playbooks (operators & RAG)

Paste-ready snippets for **Neon**, **psql**, or other Postgres clients. These are **not** a substitute for Drizzle migrations in [`migrations/`](../migrations/): use migrations for versioned schema changes in CI and deploy; use **`sql/ops/`** for ad-hoc checks, incident response, and copy-paste in the SQL editor.

**Safety:** never commit secrets. `DATABASE_URL` stays in env / host UI only.

## Layout

| Path | Purpose |
|------|---------|
| [`ops/`](ops/) | Production checks, admin lookups, schema verification, public table inventory, [wallet ledger check](ops/verify-wallet-ledger.sql) |
| [DATA_MERGE_RUNBOOK.md](../docs/DATA_MERGE_RUNBOOK.md) | Replit → Neon merge using JSON export/import (no raw wallet `COPY`) |
| [`rag/`](rag/) | Templates for future vector / retrieval workflows (AxTask has no RAG tables yet) |

## Canonical migration vs playbook

[`ops/totp-users-columns-apply.sql`](ops/totp-users-columns-apply.sql) must stay identical to [`migrations/0006_user_totp.sql`](../migrations/0006_user_totp.sql). If you change one, update the other.
