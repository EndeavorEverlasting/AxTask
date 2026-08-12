# 2026-08-12 — Session-safe R7 harness entrypoint

## Scope

This release hardens the existing AxTask repository harness after an observed R7 failure where an agent provisioned disposable PostgreSQL successfully but lost `AXTASK_LOCAL_CERT` and `DATABASE_URL` because subsequent tool calls ran in fresh PowerShell processes. It changes harness infrastructure and release evidence only. It does not change application behavior, production state, provider configuration, credentials, or deployment authorization.

## Changes

- adds `scripts/ai-harness/run-r7-local-cert.ps1`, a one-shot R7 operator runner that creates disposable `postgres:16-alpine`, generates an ephemeral local credential internally, binds it only to loopback, sets the local-cert environment in the same process, executes local certification, validates the runtime proof, runs deploy validators and the production build, and removes the container in `finally`;
- adds `axtask.skill.local-deployment-certification.v1` with trigger conditions, inputs, outputs, failure routing, and the explicit process-isolation trap;
- updates `axtask.local-deployment-certification.v1` so the session-safe runner is the preferred Windows/agent path while the raw Node command remains a low-level path for callers that truly own a persistent shell and disposable database;
- registers the runner and scoped skill in `.ai/harness.json` and maps the one-shot R7 command plus the process-isolated-shell trap in `.ai/codebase-map.json`;
- extends `validate-local-cert-harness.mjs` so the harness fails if the runner, skill, map command, manifest components, workflow session-safety markers, cleanup, sanitized handoff markers, or existing runtime-proof/report/hook/report wiring drift;
- extends `local-production-certification-contract.test.ts` with a static contract proving the R7 runner owns disposable PostgreSQL, same-process environment, runtime-proof validation, deploy validation, build, cleanup, and sanitized handoff without printing `DATABASE_URL`.

## Validation intent

The feature branch must pass authority, harness, harness-infrastructure, local-cert harness completeness, focused harness contracts, repository tests, release contract, production build, repository-location recovery, security/startup/file-limit guards, Docker runtime-assets verification, and the existing CI local-production-certification step before merge.

## Safety / proof ceiling

The new runner creates only a disposable loopback Docker PostgreSQL container and ignored sanitized `.ai/runs/<run-id>/` evidence. It never accepts or prints a production database credential, never contacts Render or Neon as part of R7, and never promotes `local-runtime` proof into deployment completion or operator acceptance.
