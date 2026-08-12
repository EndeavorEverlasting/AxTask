# 2026-08-12 — Operational harness runtime-proof wiring

## Scope

This release strengthens the existing AxTask repository harness around local production certification and sanitized `.ai/runs/...` runtime proof. It changes harness infrastructure and release evidence only; it does not change application behavior, production state, provider configuration, credentials, or deployment authorization.

## Changes

- adds `scripts/ai-harness/validate-local-cert-harness.mjs` as a standalone completeness validator for the local-cert/runtime-proof slice;
- requires the local deployment certification workflow, runtime-proof schema/skill/validator, local-cert contract test, and the completeness validator itself to remain registered at their canonical harness paths;
- maps local certification, runtime-proof validation, and local-cert harness validation in `.ai/codebase-map.json` so a fresh agent can discover the commands without reconstructing them from prose;
- registers `local-cert-harness` in `.ai/validator-registry.json` and makes the broader harness-test/local-production-certification dependency chain require it;
- extends the opt-in pre-push hook to execute the new completeness validator and the existing local-production certification contract test;
- updates the operator report template to record `runtime-proof.json`, `local-cert-report.md`, validator state, attained proof level, and proof ceiling, while treating missing/invalid proof as incomplete rather than substituting logs or prose;
- updates `.ai/README.md` so fresh-agent intake routes disposable production-mode launcher certification through `axtask.local-deployment-certification.v1` and explicitly distinguishes `local-runtime` proof from live Render/operator acceptance;
- expands harness infrastructure and validator-selection contract tests so removal or selection drift of the local-cert/runtime-proof wiring fails mechanically.

## Validation intent

The feature branch must pass authority/harness/harness-infrastructure validation, the new local-cert harness validator, focused harness contracts, repository-location recovery on Ubuntu and Windows PowerShell 5.1, security/file-limit/startup guards, repository tests, release contract, production build, deployment checks, local production certification, and Docker runtime-assets verification before merge.

## Safety / proof ceiling

Local certification may produce ignored sanitized `.ai/runs/<run-id>/runtime-proof.json` and `local-cert-report.md` artifacts. Those artifacts establish only their declared local proof level. This harness change does not contact or certify live Render or Neon, does not mutate production data, and does not authorize deployment or operator acceptance.
