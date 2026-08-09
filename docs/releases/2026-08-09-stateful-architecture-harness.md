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

The harness does not authorize product-code migration. A stateful surface can be changed only after repository evidence promotes its ledger decision to `approved` and names one bounded migration seam. Application logic remains in code/domain contracts, and proof levels cannot be promoted.

## Collision handling

This sprint is stacked on the active shared work-queue harness branch so its changes do not race PR #116 on `.ai/harness.json`, hooks, README, or closeout infrastructure.

## Validation target

- authority;
- harness;
- harness infrastructure;
- stateful architecture validator;
- stateful architecture contract test;
- repository CI on the exact PR head.
