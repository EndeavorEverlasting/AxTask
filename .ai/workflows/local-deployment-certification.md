authorityRef: axtask.agent-authority.v1

# Workflow: local deployment certification

id: axtask.local-deployment-certification.v1

## Use when

A controlled deployment candidate needs disposable local production certification before any live Render or Neon action. Use the session-safe entrypoint when the executor may start a fresh shell/process for each tool call.

## Required inputs

- candidate SHA;
- a clean candidate worktree;
- Node.js/npm and Docker for the preferred session-safe path;
- current repository build/schema state, or permission for the runner to prepare those locally.

A production or operator-supplied database credential is not required for the preferred path.

## Command

Preferred Windows/agent entrypoint (owns disposable PostgreSQL and all required environment in one process):

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/ai-harness/run-r7-local-cert.ps1 -CandidateSha <exact-sha>
```

Low-level standalone certification is allowed only when the caller already owns a persistent shell and a clearly disposable loopback PostgreSQL target. Set `DATABASE_URL` and `AXTASK_LOCAL_CERT=1` in the **same process** that launches:

`node scripts/deploy/run-local-cert.mjs`

When CI has already completed the production build and disposable schema bootstrap:

`AXTASK_LOCAL_CERT=1 node scripts/deploy/run-local-cert.mjs --schema-ready --build-ready`

## Steps

1. Resolve and verify the exact candidate SHA and require a clean tracked candidate worktree.
2. For the session-safe path, require Docker and start one disposable `postgres:16-alpine` container on a loopback-only random host port.
3. Generate the disposable credential internally; do not print it or accept a production credential as a substitute.
4. Set `DATABASE_URL`, `AXTASK_LOCAL_CERT=1`, `AXTASK_CANDIDATE_SHA`, and production-host blockers in the same PowerShell process that invokes local certification.
5. Reject Render/production host markers and every non-loopback database host.
6. Refuse ambiguous database names and never print `DATABASE_URL`.
7. Prepare the disposable PostgreSQL schema and verify migration idempotence unless `--schema-ready` is supplied.
8. Produce the production build unless `--build-ready` is supplied.
9. Start the real `scripts/production-start.mjs` launcher with local-only production secrets and a dynamically reserved port.
10. Disable reminder, archetype, retention, DB-size, ops-snapshot, adherence, and backup workers for the bounded certification process.
11. Keep startup Drizzle push and capacity checks disabled because schema/capacity belong to separate disposable-repository gates.
12. Probe `/health` for DB-free process liveness.
13. Probe `/ready` for explicit disposable PostgreSQL readiness.
14. Probe `/` to prove the built client shell is served in production mode.
15. Stop the complete child process tree created by the run.
16. Emit `.ai/runs/<run-id>/runtime-proof.json` and `.ai/runs/<run-id>/local-cert-report.md`.
17. Validate the proof with `scripts/ai-harness/validate-runtime-proof.mjs`.
18. For R7, run `npm run test:deploy` and `npm run build` before reporting PASS.
19. Remove the disposable PostgreSQL container in `finally` and restore the caller process environment.
20. Hand off only the candidate SHA, sanitized artifact paths, validator state, and `local-runtime` proof ceiling.

## Required assertions

- explicit local allow marker;
- production host markers absent;
- loopback disposable database target;
- schema/build prepared successfully;
- `/health` returns 200 with `status=ok`;
- `/ready` returns 200 with `status=ready`;
- `/` serves the built HTML client shell;
- runtime proof validates;
- deploy validator suite and production build pass for R7;
- disposable container cleanup completes or is reported as an explicit handoff blocker;
- no unresolved failures when claiming `local-runtime`.

## Known traps

- Agent/tool shell invocations may be process-isolated. Values set in one shell call can disappear before the next call.
- A `NO_GO_LOCAL_RUNTIME` proof caused by missing `AXTASK_LOCAL_CERT` or `DATABASE_URL` is still useful failure evidence; preserve it, fix the session boundary, and do not misclassify it as an application defect.
- Never ask the operator to paste a loopback password into chat when the session-safe runner can generate a disposable credential itself.

## Stop conditions

Stop and return nonzero for any repository identity, dirty tracked worktree, Docker, disposable PostgreSQL, environment, schema, build, launcher, liveness, readiness, client-shell, proof-schema, deploy-validator, or cleanup failure. Never fall back to a remote database. Never contact Render or Neon to complete this workflow.

## Evidence boundary

A bounded startup certification does not provide a useful memory-growth trend. Record `NOT_ENOUGH_SAMPLES` rather than manufacturing a memory conclusion. Failed runs retain their sanitized proof instead of being erased by an unchanged retry.

## Proof ceiling

May reach **local-runtime** proof only. It must not claim staging-runtime, live-runtime, deployment-completion, or operator-acceptance. Live deployment remains a separately authorized operation.

Scoped procedure: `axtask.skill.local-deployment-certification.v1` at `.ai/skills/local-deployment-certification.md`.
