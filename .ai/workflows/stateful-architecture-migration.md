authorityRef: axtask.agent-authority.v1

# Stateful Architecture Migration

id: axtask.stateful-architecture-migration.v1

## Trigger

Use when a task proposes serverless, stateless, function-style, edge, managed-scheduler, managed-queue, persistence-provider, process-removal, or other changes that alter a stateful/runtime boundary.

## Inputs

- current repository snapshot and branch/PR evidence;
- `.ai/stateful-surface-ledger.json` for canonical architecture decisions;
- `.ai/stateful-execution-contract.json` for deterministic evidence-task routing;
- `.ai/architecture/surfaces/*.json` for per-surface evidence gaps;
- current tests, validators, deployment/runtime contracts, and relevant implementation files;
- explicit owned scope and forbidden scope.

## Factoring rules

1. Stateful does not mean bad. KEEP is a valid final decision.
2. The target is less unnecessary state/process coupling, not 100% serverless purity.
3. Every affected surface starts from the ledger. A `provisional` entry fails closed to `keep`.
4. Evidence gathering is smaller than architecture decision-making. Complete the next unresolved ledger fact; do not rewrite the complete ledger to answer one question.
5. `approved` means the currently active migration authorization. After the seam is implemented and proven, set `decisionStatus` to `completed`; completed decisions are historical evidence and do not authorize further mutation.
6. Use one migration seam per sprint. At most one non-`keep` surface may remain `approved` at a time.
7. Skills describe reusable workflow guidance. Capabilities expose reusable operations. Triggers deterministically route conditions. Application logic remains in code and domain contracts, not hidden in prompts.
8. Do not choose a serverless provider before the ledger proves the required runtime capabilities and the owned seam.
9. Prefer deletion when evidence proves a component is unnecessary; prefer externalization only when state is required but process affinity is not; keep stateful behavior when that is the simplest correct architecture.
10. Repository/CI proof, local launcher proof, behavior observation, and live runtime proof are distinct ceilings.

## Execution loop

1. Run repository intake and reconcile `.ai/WORK_QUEUE.md`, current main, open PRs, and collisions.
2. Validate the canonical architecture ledger: `node scripts/ai-harness/validate-stateful-architecture.mjs`.
3. Validate the per-surface task artifacts: `node scripts/ai-harness/validate-stateful-surface.mjs --all`.
4. Run `node scripts/ai-harness/next-stateful-task.mjs`. The router MUST return at most one surface and one unresolved evidence gap.
5. Treat the routed task as the complete reasoning boundary: inspect only its exact files, answer only its question, and update only its named surface artifact. Do not plan adjacent surfaces while the current gap is open.
6. **Three-operation action budget:** after routing, no more than three repository/tool operations may occur without one of these productive actions: inspect an exact routed file, mutate the current surface artifact, run the current validator, or record an exact blocker with executable next action. Repeated statements that work will be written do not count.
7. Resolve the gap only with concrete repository evidence. Then run the exact command emitted under `VALIDATE`, for example `node scripts/ai-harness/validate-stateful-surface.mjs http-process-runtime --require=process-affinity`.
8. Run `node scripts/ai-harness/next-stateful-task.mjs` again. Do not manually choose the next surface while an earlier open task exists.
9. When a surface reaches `READY_FOR_DECISION`, evaluate only that surface against the matching canonical ledger entry. KEEP is valid; evidence gathering itself never authorizes product/runtime mutation.
10. Promote a non-`keep` canonical decision to `approved` only with concrete evidence, bounded prerequisites, collision paths, validators, proof ceiling, and no other active non-`keep` approved seam.
11. If an approved disposition is `replace`, `externalize`, or `delete`, implement one seam only and preserve API/domain/auth/data invariants. Then run owning application validators.
12. When the authorized seam's implementation/proof gate is complete, set it to `completed` before another non-`keep` seam can be approved.
13. Commit/push/PR under normal repository rules and produce the stateful task/operator report. Continue through the next safe checkpoint.

### Line-ending noise

If an out-of-scope tracked file appears modified only because of CRLF/LF or at-EOL whitespace, do not debate or commit the noise. Run:

```bash
node scripts/ai-harness/restore-eol-noise.mjs <tracked-path>
```

The helper refuses to restore a path when `git diff --ignore-space-at-eol` finds semantic content changes.

## Parallel lanes

Read-only evidence gathering may run in parallel only when each lane has a different routed surface artifact and exact-file ownership is non-overlapping. Parallel writers are forbidden on shared surfaces. `package.json`, `server/index.ts`, `render.yaml`, shared domain contracts, `.ai/*` registries, and the canonical ledger are convergence paths unless explicitly assigned to one owner.

## Validation

Minimum architecture-contract validation:

```bash
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
node scripts/ai-harness/validate-stateful-architecture.mjs
node scripts/ai-harness/validate-stateful-surface.mjs --all
node scripts/ai-harness/next-stateful-task.mjs --json
npx vitest run server/ai-harness/stateful-architecture-contract.test.ts server/ai-harness/stateful-task-loop-contract.test.ts
```

Then run validators selected for actual application files changed. Static validation is not runtime proof.

## Outputs

- one updated `.ai/architecture/surfaces/<surface-id>.json` evidence artifact per routed task;
- updated `.ai/stateful-surface-ledger.json` only when a single surface reaches an evidence-backed decision;
- `.ai/runs/<run-id>/stateful-task-report.md` and/or `stateful-architecture-report.md`;
- implementation/tests for one owned seam only when the canonical ledger authorizes mutation;
- commit/PR evidence and exact next action from the router.

## Proof ceiling

The evidence-task loop provides contract/harness proof only. A routed task, ledger disposition, or passing validator does not prove application behavior, deployment completion, or live runtime behavior. Report only the strongest proof actually executed.
