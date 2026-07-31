# Local Production Certification and Pre-Deployment Convergence

**Date:** 2026-07-31

## Delivered

AxTask's previously planned local-production certification is now executable and part of the required CI sequence.

`scripts/deploy/run-local-cert.mjs` launches the real `scripts/production-start.mjs` entrypoint against disposable loopback PostgreSQL, using local-only production secrets and a dynamically reserved port. It fails closed unless `AXTASK_LOCAL_CERT=1` is present and rejects every non-loopback database target.

## Runtime assertions

A successful certification proves all of the following in one bounded local run:

- the explicit local-certification authorization marker is present;
- production host markers are absent;
- the PostgreSQL target is loopback and clearly disposable;
- the production build and disposable schema are prepared;
- the production launcher starts successfully;
- `/health` returns HTTP 200 with `status=ok` without using the DB as a liveness dependency;
- `/ready` returns HTTP 200 with `status=ready` against disposable PostgreSQL;
- `/` serves the built client shell in production mode;
- runtime proof validates against `.ai/runtime-proof.schema.json`;
- the complete child process tree created by the certifier is stopped after the run.

## Resource controls

For this bounded certification process the runner disables reminder dispatch, archetype rollups/polls, retention prune, DB-size snapshots, ops snapshots, adherence interventions, and all backup workers. Startup DB capacity and Drizzle-push checks are skipped because CI separately proves disposable schema bootstrap/migrations/idempotence before the runtime step.

No `DATABASE_URL` value is written to proof artifacts or logs by the certifier.

## CI convergence order

The main `test-and-attest` lane now requires, in order:

1. typecheck and full repository tests;
2. release contract and production build;
3. browser regression and performance budgets;
4. disposable PostgreSQL bootstrap, numbered migrations, and idempotence;
5. Backup Center account round-trip certification;
6. PostgreSQL users-schema verification;
7. local production certification with `/health`, `/ready`, and client-shell smoke proof.

Docker packaging, security guard, PR file limit, and production-startup guard remain independent required workflows.

## Memory evidence

A bounded startup check is not a valid memory-growth observation window. The runtime proof records `NOT_ENOUGH_SAMPLES` rather than manufacturing a memory trend conclusion.

## Rollout

This change does not deploy AxTask and makes no Render, Neon production, DNS, credential, or live-user mutation. Merge only after the exact branch head passes the complete CI sequence including local production certification.

## Proof ceiling

The highest proof this workflow may attain is `local-runtime`. It cannot claim staging runtime, live runtime, deployment completion, production acceptance, or operator acceptance.
