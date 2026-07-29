# Prompt-Leap Runtime Routing

**Date:** 2026-07-29  
**Source:** PR #107, prompt-leap runtime routing for agent admission

## Delivered

- versioned task-demand, executor-capability, and route-decision schemas;
- deterministic task-demand classification from the evidence-versus-judgment gap;
- evidence-derived executor capability routing with allow, downgrade, block, and escalate decisions;
- fail-closed handling for unknown executors;
- explicit constraints and factoring guidance for reducing unsupported reasoning leaps;
- harness capability, trigger, workflow, and artifact registrations;
- focused routing fixtures and contract tests.

## Contract

Routing decisions are based on demonstrated capability evidence and task demands, not model or provider branding. Unknown executors are constrained to the lowest safe lane. The classifier and router remain conventional TypeScript application logic; the workflow documents invocation and proof boundaries rather than replacing runtime behavior.

## Rollout

1. Merge only after the exact PR head passes routing contracts, harness validators, typecheck, full tests, release checks, production build, and repository CI.
2. No database migration, Render change, Neon change, or production deployment is required by this contract-only feature.
3. Downstream consumers should adopt the registered task-demand and route-decision schemas before relying on prompt-leap admission outcomes.

## Validation

The PR validates schema-backed routing fixtures, classifier and router behavior, evidence-derived capability decisions, harness registry integration, TypeScript compilation, and the full repository test suite. The release check requires this tracked release record before later build and acceptance stages may run.

## Rollback

Remove the routing module, shared schemas, fixtures, focused tests, harness registrations, prompt-leap workflow, and this release record. No schema, data, provider, or deployment rollback is required.

## Proof ceiling

Repository contracts, tests, typecheck, build, and CI can prove deterministic routing behavior for the covered fixtures. They do not prove every future task classification, executor quality, production integration, live agent behavior, or protected-runtime judgment outcome.
