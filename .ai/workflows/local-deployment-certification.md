authorityRef: axtask.agent-authority.v1

# Workflow: local deployment certification

id: axtask.local-deployment-certification.v1

## Use when

A controlled deployment candidate needs disposable local production certification before any live Render or Neon action.

## Required inputs

- candidate SHA;
- explicit local allow marker `AXTASK_LOCAL_CERT=1`;
- `DATABASE_URL` pointing to loopback PostgreSQL with a database name containing `axtask`, `test`, `ci`, or `dev`;
- current repository build/schema state, or permission for the runner to prepare those locally.

## Command

Full standalone certification:

`AXTASK_LOCAL_CERT=1 node scripts/deploy/run-local-cert.mjs`

When CI has already completed the production build and disposable schema bootstrap:

`AXTASK_LOCAL_CERT=1 node scripts/deploy/run-local-cert.mjs --schema-ready --build-ready`

## Steps

1. Verify `AXTASK_LOCAL_CERT=1`.
2. Reject Render/production host markers and every non-loopback database host.
3. Refuse ambiguous database names and never print `DATABASE_URL`.
4. Prepare the disposable PostgreSQL schema and verify migration idempotence unless `--schema-ready` is supplied.
5. Produce the production build unless `--build-ready` is supplied.
6. Start the real `scripts/production-start.mjs` launcher with local-only production secrets and a dynamically reserved port.
7. Disable reminder, archetype, retention, DB-size, ops-snapshot, adherence, and backup workers for the bounded certification process.
8. Keep startup Drizzle push and capacity checks disabled because schema/capacity belong to separate disposable-repository gates.
9. Probe `/health` for DB-free process liveness.
10. Probe `/ready` for explicit disposable PostgreSQL readiness.
11. Probe `/` to prove the built client shell is served in production mode.
12. Stop the complete child process tree created by the run.
13. Emit `.ai/runs/<run-id>/runtime-proof.json` and `.ai/runs/<run-id>/local-cert-report.md`.
14. Validate the proof with `scripts/ai-harness/validate-runtime-proof.mjs`.

## Required assertions

- explicit local allow marker;
- production host markers absent;
- loopback disposable database target;
- schema/build prepared successfully;
- `/health` returns 200 with `status=ok`;
- `/ready` returns 200 with `status=ready`;
- `/` serves the built HTML client shell;
- no unresolved failures when claiming `local-runtime`.

## Stop conditions

Stop and return nonzero for any environment, schema, build, launcher, liveness, readiness, client-shell, proof-schema, or cleanup failure. Never fall back to a remote database. Never contact Render or Neon to complete this workflow.

## Evidence boundary

A bounded startup certification does not provide a useful memory-growth trend. Record `NOT_ENOUGH_SAMPLES` rather than manufacturing a memory conclusion.

## Proof ceiling

May reach **local-runtime** proof only. It must not claim staging-runtime, live-runtime, deployment-completion, or operator-acceptance. Live deployment remains a separately authorized operation.
