# AxTask Stateful Surface Ledger

This document is the human-readable companion to `.ai/stateful-surface-ledger.json`. The JSON ledger is the machine-validated source for stateful-architecture migration decisions.

## Mission

Reduce unnecessary process and state coupling **without** treating “serverless” as a destination by itself. The safe sequence is:

1. prove the current production-shaped baseline;
2. identify a concrete stateful/runtime surface;
3. gather repository evidence;
4. approve one bounded migration seam;
5. implement and validate that seam;
6. mark that migration `completed` so it remains historical evidence without staying active;
7. repeat only after the previous contract remains proven.

**Stateful does not mean bad. KEEP is a valid final decision.**

## Fail-closed decision rule

Every surface defaults to `KEEP` with `decisionStatus: provisional`.

A provisional entry **cannot authorize implementation**. Before an agent can replace, externalize, or delete a surface it must:

- inspect the listed files and current contracts;
- record concrete evidence, consumers, invariants, and collision paths;
- change exactly one non-`keep` surface to `decisionStatus: approved`;
- name exactly one seam;
- name prerequisites, forbidden changes, validators, and proof ceiling;
- pass `node scripts/ai-harness/validate-stateful-architecture.mjs`.

`approved` means the seam is actively authorized. After the implementation and required proof gate are complete, change that surface to `decisionStatus: completed`. Completed decisions remain in the ledger as historical architecture evidence but do **not** authorize more mutation. At most one non-`keep` surface may be `approved` at a time.

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

## Deployment/recovery posture — 2026-08-09

This is a timestamped operational snapshot, **not migration authorization**. Before acting, reconcile it against current `main`, open PRs/CI, `.ai/WORK_QUEUE.md`, `.ai/handoff/axtask-deployment-handoff-2026-08-09.md`, `docs/DB_RECOVERY_RUNBOOK.md`, and actual provider state. If newer evidence disagrees, newer verified evidence wins and this section must be updated.

| Surface | Status | Current evidence / gate |
| --- | --- | --- |
| Codebase | GREEN | The last fully attested application/harness candidate `8d5f896351b52c60e02d7259e64bb21092a52fa7` passed typecheck, tests, release contracts, production build, browser regression, migration/bootstrap checks, backup certification, Docker packaging, and local production certification. |
| Harness / deployment discipline | GREEN | Stateful migration guardrails, recovery runbook, work queue, proof ceilings, deployment validators, and manual re-entry controls are tracked and enforced. |
| Build artifact | GREEN | Production build, Docker runtime image verification, and local production certification have passed on the attested baseline. |
| Production configuration | GREEN/YELLOW | Repository configuration is intentionally conservative (`/health` liveness, guarded startup, `SKIP_DB_PUSH_ON_START=true`, `autoDeploy=false`, scheduled controls disabled), but actual Render provider state/configuration still requires operator revalidation before R8. |
| Database diagnosis | YELLOW | Live read-only evidence localized the capacity incident to a roughly 36 GB production database dominated by roughly 50.4M `security_events` rows; the suppression trigger was absent. Exact R1 event-type/timestamp evidence is still incomplete until the canonical audit completes. |
| Data preservation | RED | Production R1.5 portable account-evidence preservation and R3 raw backup + disposable restore proof have not yet been completed. |
| Database recovery | RED | Containment, targeted cleanup, physical reclaim, and other production mutation remain deliberately unauthorized until preservation/backup prerequisites and explicit operator authorization are satisfied. |
| Render deployment | RED | Production app runtime remains intentionally unproven/offline. R8 is blocked until R0–R7 are recorded and one controlled deployment is explicitly authorized. |
| Overall | LATE RECOVERY / PRE-DEPLOYMENT | AxTask is no longer primarily in a broad application-development or “make it deployable” phase. The critical path is production recovery evidence followed by one controlled re-entry. |

### Current critical path to deployment

1. Finish repository-side R1 audit hardening and run the canonical read-only production audit to completion, preserving `production-audit.json` outside Git.
2. Complete R1.5 account/evidence preservation, including hash verification and the required independently controlled copies.
3. Complete R3 raw production backup and prove restore into a disposable PostgreSQL target.
4. Re-read current evidence and perform only the smallest explicitly authorized containment/reclaim action; do not broaden recovery into architecture migration.
5. Complete post-recovery capacity decision and R7 production-shaped local certification.
6. Revalidate actual Render service state/configuration and perform one explicitly authorized exact-commit R8 resume/deploy.
7. Complete R9 observation: verify telemetry no longer grows pathologically, meaningful security events still work, database size remains stable, and the app remains healthy.

### Architecture consequence of the incident

- Do **not** launch another broad “make AxTask deployable” rewrite. Repository/build/runtime contracts are already substantially proven; the unresolved work is production recovery.
- Do **not** start serverless decomposition while the production baseline is still under recovery. Establish one clean deployment and stable observation window first so architecture changes are not debugged against a moving incident baseline.
- The `security_events` incident is evidence that high-volume request telemetry should not be allowed to grow without bound in the relational product database. It is **not** evidence that PostgreSQL/domain persistence is unnecessary or that the Node server should be removed wholesale.
- Later architecture work should evaluate pathological request telemetry as a strong `delete` or `externalize` candidate, while preserving durable relational domain state unless separate evidence justifies changing it.
- A boring, evidence-backed deployment is the desired next milestone; “100% serverless” is not.

## Current conservative baseline

The machine ledger currently treats the following as `KEEP / provisional` unless specifically noted:

- Express request/runtime process;
- PostgreSQL/Drizzle domain persistence;
- authentication/session state;
- scheduled/background work;
- filesystem/artifact handling;
- deployment/startup orchestration;
- cache/queue dependencies pending concrete usage evidence.

The harness/application integration-seam rule is `KEEP / approved`: prompts and agent routing remain orchestration only, while product behavior stays executable in code/domain contracts. Because its disposition is `keep`, it is not a migration authorization.

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
- `provisional | approved | completed`;
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
