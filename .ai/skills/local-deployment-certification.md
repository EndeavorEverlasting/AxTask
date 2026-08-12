authorityRef: axtask.agent-authority.v1

# Skill: session-safe local deployment certification

id: axtask.skill.local-deployment-certification.v1

## Trigger conditions

Use this skill for R7 or any request to prove the real AxTask production launcher locally against disposable PostgreSQL, especially when an agent/tool may execute each shell command in a fresh process.

## Required inputs

- a clean AxTask candidate worktree;
- the candidate SHA when the workflow requires an exact revision;
- Node.js/npm and Docker with a reachable local daemon.

A database credential is **not** an operator input for the preferred session-safe path. The runner generates an ephemeral local PostgreSQL credential inside one PowerShell process and never prints it.

## Preferred procedure

From the candidate worktree run:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/ai-harness/run-r7-local-cert.ps1 -CandidateSha <exact-sha>
```

The runner owns one disposable `postgres:16-alpine` container, assigns a loopback-only random host port, sets `DATABASE_URL`, `AXTASK_LOCAL_CERT=1`, and `AXTASK_CANDIDATE_SHA` in the **same process** that invokes `scripts/deploy/run-local-cert.mjs`, validates the emitted runtime proof, runs `npm run test:deploy`, runs `npm run build`, and removes the container in `finally`.

## Expected outputs

Successful completion prints only sanitized handoff values:

- `R7_CANDIDATE_SHA=<sha>`;
- `R7_RUNTIME_PROOF=.ai/runs/<run-id>/runtime-proof.json`;
- `R7_LOCAL_CERT_REPORT=.ai/runs/<run-id>/local-cert-report.md`;
- `R7_PROOF_CEILING=local-runtime`.

The registered runtime proof and report remain ignored artifacts under `.ai/runs/`.

## Failure handling

If `NO_GO_LOCAL_RUNTIME` is produced, preserve the sanitized runtime proof and route through `axtask.failure-recovery.v1`. Do not delete the proof and do not retry unchanged. The runner must fail closed if the tracked worktree is dirty, Docker is unavailable, PostgreSQL never becomes ready, the proof path is missing/invalid, deploy validators fail, or the production build fails.

## Known traps

- Tool/agent shell calls may be process-isolated. Environment variables assigned in one invocation may not exist in the next.
- Do not split disposable database provisioning, `DATABASE_URL`, `AXTASK_LOCAL_CERT`, and the local-cert launch across separate shell calls unless the executor explicitly guarantees one persistent process.
- Never substitute Neon, Render, a remote PostgreSQL host, or a production credential for the disposable database.
- Never print or copy the ephemeral `DATABASE_URL` into chat, reports, Git, or handoff text.

## Proof ceiling

This skill may reach `local-runtime` only. It does not prove Render/Neon state, live deployment, production cleanup, or operator acceptance.
