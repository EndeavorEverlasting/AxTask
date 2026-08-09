# Stateful single-fact harness execution — 2026-08-09

## Scope

Harness infrastructure only. This release does not change product/runtime behavior, database contents, deployment provider state, or repository governance.

## Changes

- adds a machine-readable stateful execution contract that routes at most one unresolved evidence fact at a time;
- splits stateful evidence into tracked per-surface artifacts under `.ai/architecture/surfaces/` instead of requiring agents to regenerate the complete ledger;
- adds `next-stateful-task.mjs` to emit one surface, one gap, exact files, one artifact, one validator, one completion gate, and one next command;
- adds `validate-stateful-surface.mjs` with focused `--require=<gap-id>` validation and placeholder rejection;
- adds a three-operation action budget after routing to prevent repeated planning-without-mutation loops;
- adds bounded CRLF/LF noise repair that refuses semantic changes;
- wires per-surface validation into local hooks and focused contract tests;
- preserves the canonical `.ai/stateful-surface-ledger.json` as the decision ledger rather than a scratchpad for every evidence question.

## Safety

- `EVIDENCE_REQUIRED` tasks never authorize product/runtime mutation.
- The canonical fail-closed KEEP/provisional rules remain intact.
- No serverless provider is selected or introduced.
- No `AGENTS.md` or other governance contract is modified.
- No secrets, runtime logs, database dumps, or production evidence are tracked.

## Validation

Required repository gates include authority, harness completeness, canonical stateful architecture validation, all per-surface task artifacts, focused stateful task-loop tests, `git diff --check`, existing tests, and production build through normal CI.
