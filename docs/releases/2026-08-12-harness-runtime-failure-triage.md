# 2026-08-12 — Runtime failure triage harness

## Scope

This release closes the harness gap exposed by a schema-valid R7 `NO_GO_LOCAL_RUNTIME` run that preserved `runtime-proof.json` but surfaced only a generic terminal exception. It changes repository harness infrastructure only: maps, registries, runtime-proof triage tooling, failure-recovery procedure, report artifacts, and harness validation. It does not change AxTask application behavior, governance, production data, Render/Neon state, credentials, or deployment authorization.

## Changes

- adds `scripts/ai-harness/summarize-runtime-failure.mjs`, which validates the existing runtime proof before deriving a deterministic sanitized failure classification, primary failure, failed assertion IDs/descriptions, retry policy, and failure-recovery workflow;
- emits ignored sibling `.ai/runs/<run-id>/runtime-failure-summary.json` and `.ai/runs/<run-id>/runtime-failure-report.md` artifacts without copying commands, assertion evidence, connection strings, or raw logs;
- adds a machine contract at `.ai/schemas/runtime-failure-summary.schema.json` and an English operator-report template at `.ai/reports/runtime-failure-report-template.md`;
- registers the summarizer, schema, report, command, and generated artifacts in the existing harness/codebase/artifact spine;
- extends bounded failure recovery so a schema-valid runtime proof is summarized before an unchanged retry;
- extends local-cert harness completeness validation so removal of the triage script/schema/report/registration or R7 runner integration fails mechanically;
- updates the session-safe R7 runner so a `NO_GO` invokes triage and prints canonical sanitized summary/report paths before returning nonzero;
- adds focused contract coverage for deterministic classification, sibling-proof consistency, report generation, no-failure behavior, and exclusion of assertion evidence from the summary.

## Safety / proof ceiling

Runtime failure triage does not raise proof level. It only explains a proof that already exists. A local `NO_GO` remains below `local-runtime`, and a successful local run remains capped at `local-runtime`. The summarizer never contacts Render, Neon, or any database and never retries the failed runtime workflow automatically.
