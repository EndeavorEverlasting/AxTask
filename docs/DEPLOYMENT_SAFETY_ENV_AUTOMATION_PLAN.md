# Deployment Safety: runtime memory diagnostics + worker isolation

Status: ACTIVE

## Why this change

Render logs now show two independent startup/runtime signatures:

1. `Interactive prompts require a TTY terminal` (schema push attempted in non-interactive runtime)
2. `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` (runtime OOM)

Startup safety from PR #57 remains the guardrail: production startup must **not** run live `drizzle-kit push` unless explicitly opted in.

## Runtime memory isolation test (Render-friendly)

Goal: isolate high-memory background loops without repeated builds.

1. Deploy once from the branch with this instrumentation.
2. Keep Build Command unchanged; only toggle **Runtime env vars** and restart service (no code rebuild).
3. Baseline run:
   - `DISABLE_REMINDER_DISPATCH=true`
   - `DISABLE_ARCHETYPE_ROLLUP=true`
   - `DISABLE_RETENTION_PRUNE=true`
   - `DISABLE_DB_SIZE_SNAPSHOT=true`
   - `BACKUP_SCHEDULER_ENABLED=false`
   - `BACKUP_QUEUE_WORKER_ENABLED=false`
   - `BACKUP_BULLMQ_ENABLED=false`
4. Verify log sequence includes:
   - `[memory] boot ...`
   - `[express] serving on port 5000`
5. Re-enable **one worker family at a time** and compare before/after memory logs.

## Triage diagram

```mermaid
flowchart TD
  A[Boot: production-start] --> B{TTY prompt signature?}
  B -->|Yes| C[Classify as STARTUP_TTY_INTERACTIVE_PROMPT]
  B -->|No| D[Server boot logs]
  D --> E[[memory] boot snapshot]
  E --> F{OOM signature later?}
  F -->|Yes| G[Classify as RUNTIME_OOM]
  F -->|No| H[Healthy runtime]
  G --> I[Disable workers via env flags]
  I --> J[Re-enable one worker at a time]
  J --> K[Compare memory before/after tick]
```

## Rollback

- Set all optional workers to disabled (flags above).
- Keep `SKIP_DB_PUSH_ON_START=true`.
- Restart service; do not run interactive schema evolution in runtime startup.
