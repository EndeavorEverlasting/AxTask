authorityRef: axtask.agent-authority.v1

# Workflow: local deployment certification

id: axtask.local-deployment-certification.v1

## Use when

A controlled deployment candidate needs disposable local production certification before any live Render or Neon action.

## Required inputs

- candidate SHA
- current `origin/main` base
- explicit local allow marker (`AXTASK_LOCAL_CERT=1`)
- a loopback or disposable database target
- selected capabilities and validators from the registries

## Steps

1. Verify the candidate SHA is current and the branch is green on current head.
2. Confirm the environment gate: `AXTASK_LOCAL_CERT=1` and database host is loopback, Docker-local, or an explicit allowlist entry.
3. Refuse production connection strings and production credentials.
4. Prepare a disposable PostgreSQL target.
5. Run migrations and verify idempotence.
6. Run the production build.
7. Start the production launcher with the disposable database.
8. Probe `/health` (DB-free) and `/ready` (DB-backed) separately.
9. Run bounded smoke behavior against local fixtures.
10. Collect sanitized process and memory evidence.
11. Stop and clean only resources created by this run.
12. Emit a runtime-proof artifact and a GO/NO-GO conclusion.
13. Record results in the coordination issue without claiming live deployment.

## Stop conditions

Stop for any unresolved startup, migration, health, memory, environment, or behavior failure. Stop for missing operator authorization. Stop if the database target is not explicitly local or disposable.

## Proof ceiling

May reach **local-runtime** proof. Must not claim live-runtime, deployment-completion, or operator-acceptance without authorized Render access, deployment ID, observed live endpoints, and an observation window.

## Next owner

P08 deployment candidate repair and integration convergence, or P09 runtime diagnostics and local production certification execution.
