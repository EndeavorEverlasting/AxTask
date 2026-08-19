authorityRef: axtask.agent-authority.v1

# 30k domain — data-state

**Load when:** changing PostgreSQL/Drizzle schema, migrations, backups/restores, recovery, retention, scheduled database work, persistence ownership, or stateful/serverless architecture. Do not preload live-provider history or unrelated app domains.

## Responsibility and boundaries

- `shared/schema.ts` is the Drizzle model barrel; ordered production DDL lives under `migrations/`.
- Deterministic migrations run through `scripts/apply-migrations.mjs`; interactive Drizzle push is operator-only.
- Production data mutation, cleanup, restore, or provider action requires explicit authorization and runtime proof beyond repository/CI.
- Cross-domain handoff: production startup/Render → `deployment-runtime`; auth/data exposure → `security-identity`.

## Demand-loaded owners

The machine-owned trigger → canonical-path table lives in `.ai/disclosure-map.json` and is appended by `show-context.mjs domain data-state`. Load only the matching data/state contract.

## Registered workflows

`axtask.account-backup-roundtrip-certification.v1`, `axtask.stateful-architecture-migration.v1`, and `axtask.log-retention-capacity-defense.v1`. Load one with `node scripts/ai-harness/show-context.mjs workflow <id>`.

Use `.ai/codebase-map.json` only when the selected task needs deeper scripts/configuration paths.
