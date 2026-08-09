authorityRef: axtask.agent-authority.v1

# Stateful Architecture Migration

id: axtask.stateful-architecture-migration.v1

## Trigger

Use when a task proposes serverless, stateless, function-style, edge, managed-scheduler, managed-queue, persistence-provider, process-removal, or other changes that alter a stateful/runtime boundary.

## Inputs

- current repository snapshot and branch/PR evidence;
- `.ai/stateful-surface-ledger.json`;
- `docs/architecture/STATEFUL_SURFACE_LEDGER.md`;
- current tests, validators, deployment/runtime contracts, and relevant implementation files;
- explicit owned scope and forbidden scope.

## Factoring rules

1. Stateful does not mean bad. KEEP is a valid final decision.
2. The target is less unnecessary state/process coupling, not 100% serverless purity.
3. Every affected surface starts from the ledger. A `provisional` entry fails closed to `keep`.
4. `approved` means the currently active migration authorization. A migration may proceed only when its decision is `approved`, evidence is current, and the sprint owns the named migration seam. After the seam is implemented and its required proof is recorded, set `decisionStatus` to `completed`; completed decisions are historical evidence and do not authorize further mutation.
5. Use one migration seam per sprint. At most one non-`keep` surface may remain `approved` at a time. Do not combine request-runtime, persistence, auth/session, background work, and deployment-provider rewrites when their files or proof contracts collide.
6. Skills describe reusable workflow guidance. Capabilities expose reusable operations. Triggers deterministically route conditions. Application logic remains in code and domain contracts, not hidden in prompts.
7. Do not choose a serverless provider before the ledger proves the required runtime capabilities and the owned seam.
8. Prefer deletion when evidence proves a component is unnecessary; prefer externalization only when state is required but process affinity is not; keep stateful behavior when that is the simplest correct architecture.
9. Repository/CI proof, local launcher proof, behavior observation, and live runtime proof are distinct ceilings.

## Execution loop

1. Run repository intake and reconcile `.ai/WORK_QUEUE.md`, current main, open PRs, and collisions.
2. Validate the current ledger before mutation: `node scripts/ai-harness/validate-stateful-architecture.mjs`.
3. Inspect the owned surface's exact files and contracts. Record evidence in the ledger; do not infer active behavior from dependency names alone.
4. Update exactly the owned ledger entry. Promote `decisionStatus` from `provisional` to `approved` only with concrete evidence, bounded prerequisites, collision paths, validators, and proof ceiling. Before promotion, prove there is no other non-`keep` `approved` surface.
5. If the approved disposition is `keep`, record why and stop architecture mutation for that surface.
6. If the disposition is `replace`, `externalize`, or `delete`, implement only the named migration seam. Preserve API/domain/auth/data invariants.
7. Select and execute validators. Static validation is not runtime proof.
8. Update the ledger with post-change evidence and strongest attained proof. When the authorized seam's required implementation/proof gate is complete, set its `decisionStatus` to `completed` before approving another non-`keep` seam.
9. Commit/push/PR under normal repository rules and produce the registered stateful-architecture operator report.
10. Continue through the next safe checkpoint; do not stop merely because a PR exists or CI is green.

## Parallel lanes

Read-only evidence gathering may run in parallel when collision ownership is explicit:

- request/runtime: `server/**`, startup and HTTP lifecycle;
- persistence: schema, migrations, DB adapters and recovery;
- background work: schedules, workers, retention, reminders and rollups;
- deployment/harness: Render/Docker/startup/CI and agent control-plane contracts.

Parallel writers are forbidden on shared surfaces. `package.json`, `server/index.ts`, `render.yaml`, shared domain contracts, and `.ai/*` registries are convergence/collision paths unless explicitly assigned to one owner.

## Validation

Minimum architecture-contract validation:

```bash
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
node scripts/ai-harness/validate-stateful-architecture.mjs
npx vitest run server/ai-harness/stateful-architecture-contract.test.ts
```

Then run validators selected for the actual application files changed. A migration sprint that changes runtime behavior normally requires typecheck, tests, build, and the strongest relevant launcher/deploy/runtime proof.

## Outputs

- updated `.ai/stateful-surface-ledger.json`;
- synchronized `docs/architecture/STATEFUL_SURFACE_LEDGER.md` when human-facing meaning changes;
- `.ai/runs/<run-id>/stateful-architecture-report.md`;
- implementation/tests for one owned seam when the ledger authorizes mutation;
- commit/PR evidence and exact next action.

## Proof ceiling

The workflow itself provides harness/contract proof only. A ledger disposition or passing validator does not prove application behavior, deployment completion, or live runtime behavior. Report only the strongest proof actually executed.
