# Shared agent work queue and continuation loop — 2026-08-09

authorityRef: axtask.agent-authority.v1

## Objective

Add a persistent repository-owned coordination ledger that users and agents can update together so unfinished work survives chat/session boundaries and agents continue through obvious safe checkpoints instead of stopping after implementation, validation, PR creation, or green CI.

The ledger is an index and coordination surface, not a duplicate source of implementation truth. Source files, executable contracts, current `main`, issues/PRs, CI, runbooks, and runtime evidence remain authoritative for the component being worked.

## Delivered

- `.ai/WORK_QUEUE.md`
  - canonical shared user/agent work ledger;
  - explicit task ownership, dependencies, scope, forbidden scope, acceptance gate, proof, blocker/operator gate, and next action;
  - statuses `READY`, `CLAIMED`, `VERIFY`, `REVIEW`, `MERGE`, `OPERATOR`, `BLOCKED`, and `DONE`;
  - `VERIFY`, `REVIEW`, and `MERGE` are continuation states, not stopping states;
  - strict `DONE` contract requiring the acceptance gate to be satisfied, durable proof to exist, and the canonical terminal action `none; no safe actionable work remains`;
  - current production-recovery work seeded as R1 → R1.5 → R3 → containment → controlled Render recovery, with production/operator boundaries preserved.
- `scripts/ai-harness/validate-work-queue.mjs`
  - validates task IDs, fields, statuses, priorities, claims, operator/blocker gates, continuation actions, and strict DONE semantics.
- `server/ai-harness/work-queue-contract.test.ts`
  - executes the real queue validator;
  - rejects proofless DONE, MERGE-as-stop, and operator states without an exact gate.
- `.ai/README.md`
  - makes queue reconciliation and claiming part of fresh-agent intake;
  - requires agents to continue through commit, push, PR, CI/review repair, and merge whenever those actions remain safe, authorized, and tool-accessible.
- `.ai/harness.json`
  - registers the queue and queue validator as harness components and hook policy.
- `.ai/workflows/pr-closeout.md`
  - makes a green PR a continuation point rather than a default handoff point when merge is safe and authorized;
  - requires queue proof/state updates during closeout.
- `.githooks/pre-commit` and `.githooks/pre-push`
  - run the queue validator;
  - pre-push also runs the queue contract test.

## Agentic continuation contract

A task is not complete merely because code was written, tests passed, a commit was pushed, a PR opened, or CI became green. When the same agent has the required tools and no human-only, forbidden-scope, collision, or failing-check gate remains, it should advance the work through the next real boundary in the same session.

Legitimate stopping states are:

- `DONE`: acceptance gate is fully satisfied and no safe actionable work remains in scope;
- `BLOCKED`: a concrete dependency/collision/external failure/forbidden boundary prevents progress;
- `OPERATOR`: progress requires human-controlled credentials, production/runtime access, explicit approval, or another operator-only action.

The queue must be updated before a session stops so the next user or agent sees the strongest durable proof, the exact remaining gate, and the first executable next action.

## Concurrency model

Agents claim a task block before substantial mutation and re-read the current queue before editing it. Queue updates must preserve other agents' newer claims and task entries. The queue does not authorize rewriting or deleting unrelated concurrent work.

## Safety boundary

This sprint changes repository coordination/harness behavior only. It does **not**:

- connect to Neon production;
- run production R1/R1.5/R3;
- mutate or delete production database rows;
- resume or deploy Render;
- store production evidence, credentials, or secrets in Git;
- grant agents authority beyond `AGENTS.md`, `AGENT_GUARDRAILS.md`, `.ai/authority.json`, or the current task's owned scope.

Production recovery items remain explicitly `OPERATOR` or `BLOCKED` in the queue until their live gates are actually satisfied.

## Validation

Required repository proof for this change:

```bash
node scripts/ai-harness/validate-work-queue.mjs
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
npx vitest run server/ai-harness/work-queue-contract.test.ts server/ai-harness/harness-contract.test.ts server/ai-harness/harness-infrastructure-contract.test.ts
npm run release:check
```

The pull-request exact head must also pass the repository's full `test-and-attest`, Docker, security, and PR-file-limit workflows before merge. Any valid review finding must be repaired before closeout.

## First CI feedback

The initial PR head successfully passed dependency installation, TypeScript, and the full test suite—including the new work-queue contract and existing harness contracts. `release:check` then failed closed because this release evidence file had not yet been added. This document satisfies that repository release-evidence requirement rather than weakening or bypassing the guardrail.

## Proof ceiling

Passing repository CI proves the queue/harness contracts and repository integration. It does not prove production database preservation, Render recovery, or live deployment. Those remain separate queue items with explicit operator/runtime gates.
