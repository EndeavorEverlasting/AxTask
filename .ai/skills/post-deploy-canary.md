authorityRef: axtask.agent-authority.v1

# Skill: post-deploy canary

id: axtask.skill.post-deploy-canary.v1

## Purpose

Verify the live AxTask deployment immediately after production-connected `main` advances, using read-only health and smoke evidence.

This adapts the useful part of gstack `/canary`: establish an expected baseline, check for changes rather than assuming CI equals production, collect evidence, and alert on persistent regressions. It does not require or import gstack's browse daemon.

## Activation

Use after:

- a production deployment reports completion;
- `main` was promoted and Render auto-deploy should have started;
- an operator asks to verify production after deployment.

## Required inputs

- expected deployed/main SHA;
- production URL or provider-resolved service URL;
- promotion/deployment start timestamp;
- deployment ID when available;
- any predeploy baseline or known-good health result.

## Procedure

1. Record the expected SHA, production URL, and observation start time before probing.
2. Resolve provider deployment status when authenticated provider evidence is available. If unavailable, state that limitation rather than inventing status.
3. Run DB-free `/health` first. It must be the routine liveness probe.
4. Probe `/` or another known public shell route to confirm the deployed client/server path is responding.
5. Probe `/ready` once as an explicit database-readiness check when the deployment gate requires it. Do not poll `/ready` as liveness.
6. When a safe deployment/version identity endpoint or provider metadata exists, verify the live deployment corresponds to the expected SHA. If no such signal exists, record `LIVE_SHA_UNVERIFIED`.
7. Perform a bounded repeat of the read-only liveness/smoke probes when the environment allows, distinguishing transient failure from persistent failure.
8. Compare against the predeploy/known-good baseline when one exists.
9. Record each failure with timestamp, endpoint, HTTP/result class, expected value, observed value, and whether it persisted.
10. Classify:
    - `HEALTHY` — required probes pass and no persistent regression is observed;
    - `DEGRADED` — service responds but one or more non-liveness checks regress;
    - `BROKEN` — liveness fails persistently, startup/deploy fails, or the expected production path is unavailable;
    - `INCONCLUSIVE` — required live evidence cannot be obtained.
11. For `DEGRADED` or `BROKEN`, stop certification and present the safest rollback/investigation action. Do not auto-rollback without separate operator authorization.
12. Record the attained live proof in the existing runtime-proof/operator-report surfaces without escalating beyond actual evidence.

## Evidence rules

- `/health` proves process liveness only.
- `/ready` proves explicit DB readiness at the time of that request only.
- HTTP success does not prove every authenticated user workflow.
- Merge success does not prove deploy success.
- Provider `deployed` status does not replace application health.
- A single transient network failure is not enough to declare the deploy broken when a bounded re-check can distinguish it.

## Guardrails

- Read-only production observation.
- No data mutation, login impersonation, destructive probes, database writes, or secret-bearing output.
- No browser dependency is required.
- Do not invent deployment IDs, commit identity, provider status, or baseline values.
- Do not keep `/ready` hot as a monitoring endpoint.

## Outputs

Use existing runtime-proof, operator-report, and final-handoff artifacts. Include:

- expected SHA;
- observed provider/deploy identity if available;
- liveness/readiness/smoke results;
- observation timestamps;
- status classification;
- proof ceiling;
- exact rollback/investigation next action when not healthy.

## Proof ceiling

Live read-only health/smoke proof only. Full user-journey acceptance requires separately authorized live acceptance testing.
