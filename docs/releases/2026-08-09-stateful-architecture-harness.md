# Stateful Architecture Harness Guardrails — 2026-08-09

## Purpose

Make AxTask's move toward a less stateful/server-dependent architecture executable without allowing fresh agents to reinterpret “serverless” as permission for a broad rewrite.

## Added contracts

- machine-readable `.ai/stateful-surface-ledger.json` with fail-closed `KEEP / provisional` defaults;
- ledger schema and validator;
- scoped stateful-architecture workflow and skill;
- deterministic routing trigger and reusable ledger-validation capability;
- tracked human ledger and non-tracked operator-report artifact contract;
- pre-commit/pre-push enforcement and negative contract tests.

## Safety boundary

The harness does not authorize product-code migration. A stateful surface can be changed only after repository evidence promotes its ledger decision to `approved` and names one bounded migration seam. At most one approved non-`keep` seam may exist at a time. Application logic remains in code/domain contracts, and proof levels cannot be promoted.

## Collision handling

This sprint was initially stacked behind PR #116 to avoid racing its work-queue harness changes. After #116 merged, this branch was reconciled onto current `main` while preserving the merged work-queue continuation contracts and carrying only the stateful-architecture sprint's owned files.

## Review hardening

Automated review identified fail-open cases in the first validator revision. The final validator now:

- applies the declared ledger schema instead of merely loading it;
- uses a token-safe `one named migrationSeam` rule rather than substring matching;
- rejects more than one approved non-`keep` migration seam;
- includes negative tests for malformed schema values, multiple approved seams, missing routing, provisional mutation, and prompt-only product behavior.

## Validation target

- authority;
- harness;
- harness infrastructure;
- work queue;
- stateful architecture validator;
- focused harness contract tests;
- docs/release contracts;
- repository CI on the exact PR head.
