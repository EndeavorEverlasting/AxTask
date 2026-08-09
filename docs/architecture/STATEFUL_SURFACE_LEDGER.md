# AxTask Stateful Surface Ledger

This document is the human-readable companion to `.ai/stateful-surface-ledger.json`. The JSON ledger is the machine-validated source for stateful-architecture migration decisions.

## Mission

Reduce unnecessary process and state coupling **without** treating “serverless” as a destination by itself. The safe sequence is:

1. prove the current production-shaped baseline;
2. identify a concrete stateful/runtime surface;
3. gather repository evidence;
4. approve one bounded migration seam;
5. implement and validate that seam;
6. repeat only after the previous contract remains proven.

**Stateful does not mean bad. KEEP is a valid final decision.**

## Fail-closed decision rule

Every surface defaults to `KEEP` with `decisionStatus: provisional`.

A provisional entry **cannot authorize implementation**. Before an agent can replace, externalize, or delete a surface it must:

- inspect the listed files and current contracts;
- record concrete evidence, consumers, invariants, and collision paths;
- change the ledger to `decisionStatus: approved`;
- name exactly one seam;
- name prerequisites, forbidden changes, validators, and proof ceiling;
- pass `node scripts/ai-harness/validate-stateful-architecture.mjs`.

Agents must not choose a serverless provider as a substitute for this evidence.

## One seam, one owner

Use one seam per sprint. Safe read-only evidence lanes may run in parallel, but shared writers do not:

| Lane | Read-only scope | Principal collisions |
| --- | --- | --- |
| Request/runtime | HTTP process, middleware, startup, route lifecycle | `server/index.ts`, shared middleware, startup |
| Persistence | PostgreSQL, schema, migrations, adapters, backup/recovery | `shared/schema.ts`, `migrations/**`, `scripts/db/**` |
| Background work | cron, reminders, rollups, retention, queues/workers | `render.yaml`, `server/**`, `scripts/**` |
| Deployment/harness | Render/Docker/CI/startup and agent control plane | `render.yaml`, `package.json`, `.ai/**` |

`package.json`, `server/index.ts`, `render.yaml`, shared domain contracts, and `.ai/*` registries are convergence surfaces and get one writer.

## Product behavior boundary

- Skills describe reusable workflow guidance.
- Capabilities expose reusable operations.
- Triggers deterministically route conditions.
- Application logic remains in code and domain contracts.
- Prompts can orchestrate work but **must not become the only implementation of product behavior**.

If an agent’s proposed “simplification” moves domain behavior, auth rules, retry logic, state transitions, or persistence semantics into prose, reject it.

## Proof ladder

Never promote evidence:

1. contract proof;
2. harness proof;
3. static test proof;
4. build proof;
5. launcher/browser proof;
6. command ACK proof;
7. behavior observed proof;
8. live runtime proof.

A green build is not a live deployment. A local launcher is not production behavior. A provider command ACK is not user-visible correctness.

## Current conservative baseline

The machine ledger currently treats the following as `KEEP / provisional` unless specifically noted:

- Express request/runtime process;
- PostgreSQL/Drizzle domain persistence;
- authentication/session state;
- scheduled/background work;
- filesystem/artifact handling;
- deployment/startup orchestration;
- cache/queue dependencies pending concrete usage evidence.

The harness/application integration-seam rule is `KEEP / approved`: prompts and agent routing remain orchestration only, while product behavior stays executable in code/domain contracts.

These are not claims that every component must remain forever. They are a deliberate ban on architecture-by-vibe.

## Required inspection dimensions

For every surface record:

- owner and exact files;
- responsibility and state held;
- state lifetime and persistence mechanism;
- consumers;
- process affinity and long-lived connection need;
- filesystem and scheduling dependency;
- deployment coupling;
- invariants and stable contracts;
- evidence;
- `keep | replace | externalize | delete`;
- `provisional | approved`;
- rationale and one migration seam;
- prerequisites and forbidden changes;
- validators, proof ceiling, and collision paths.

## Validation

```bash
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
node scripts/ai-harness/validate-stateful-architecture.mjs
npx vitest run server/ai-harness/stateful-architecture-contract.test.ts
```

Application mutations require the validators for their own files in addition to these harness checks.
