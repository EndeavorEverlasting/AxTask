authorityRef: axtask.agent-authority.v1

# Prompt-Leap Routing Workflow

id: axtask.prompt-leap-routing.v1

## Purpose

Classify task reasoning demand, match against executor capability evidence, emit route decision with exact constraints, and enforce at runtime seam.

## Trigger

`task-classification-requested` — A task requires routing decision before executor assignment.

## Steps

1. **Classify Task Demand**
   - Input: task metadata (owned files, forbidden files, exact transformations, binary assertions, validation order, stop conditions, judgments required)
   - Invoke: `classifyTaskDemand` from `server/ai/routing/classifier.ts`
   - Output: `task-demand.json` (matches `shared/schemas/agent-routing/task-demand.schema.json`)
   - Artifact: `.ai/runs/<run-id>/task-demand.json`

2. **Resolve Executor Capability**
   - Input: executor ID
   - Query: capability registry (`axtask.capability-registry.v1`) for evidence profile
   - If unknown executor: fail closed → `lane: blocked`, `maxAllowedDemand: bounded-deterministic`
   - Output: `ExecutorCapability` (matches `shared/schemas/agent-routing/executor-capability.schema.json`)

3. **Compute Route Decision**
   - Input: task demand + executor capability
   - Invoke: `makeRouteDecision` from `server/ai/routing/router.ts`
   - Output: `route-decision.json` (matches `shared/schemas/agent-routing/route-decision.schema.json`)
   - Artifact: `.ai/runs/<run-id>/route-decision.json`

4. **Emit Constraints to Prompt/Task Profile**
   - Required constraints from route decision → inject into prompt/task spec
   - Constraint types: owned-files, forbidden-files, exact-transformation, binary-assertions, validation-order, stop-conditions
   - Enforcement timing: pre-flight, post-flight, continuous

5. **Runtime Enforcement** (wired at launch seam)
   - Pre-flight: validate owned-files/forbidden-files paths; verify exact-transformation specs exist; check binary-assertions are boolean predicates
   - Continuous: enforce validation-order; check stop-conditions
   - Post-flight: verify binary-assertions passed; collect runtime-proof if runtime-certification lane

6. **Record Decision**
   - Persist route decision with `decisionId`, `validUntil`, and factoring guidance
   - If `decision === block` or `downgrade`: include `blockOrDowngradeReason` and `factoringGuidance`

## Outputs

- `.ai/runs/<run-id>/task-demand.json`
- `.ai/runs/<run-id>/route-decision.json`
- Updated prompt/task profile with `requiredConstraints`

## Failure Modes

- Unknown executor → block, lane=deterministic-repair, reason="No evidence recorded"
- Task demand > executor maxAllowedDemand → downgrade, emit factoring guidance
- Executor lane < required lane → downgrade
- Schema validation failure → block, handoff to failure-recovery

## Validators

- `validate-harness.mjs` (schema validation for task-demand, route-decision)
- `authority` (authorityRef check)
- `harness` (cross-references)

## Proof Ceiling

Contract — produces deterministic schemas and validated route decisions. No live environment required.