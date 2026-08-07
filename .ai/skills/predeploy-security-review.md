authorityRef: axtask.agent-authority.v1

# Skill: predeploy security review

id: axtask.skill.predeploy-security-review.v1

## Purpose

Run a bounded, deployment-focused security delta review before AxTask production promotion.

This imports only the useful predeploy slice of gstack `/cso`: infrastructure-first inspection, supply-chain awareness, CI/CD scrutiny, secret-handling checks, and evidence-backed findings. It intentionally does not import gstack's broad recurring OWASP/STRIDE program, browser tooling, or unrelated product-audit phases.

## Activation

Run for **every** candidate entering `axtask.main-branch-deployment.v1`, because the authorization gate always requires a current machine-readable security disposition for the exact candidate/base. Keep the review bounded to the actual diff and adjacent code needed to prove findings.

The review expands automatically when a deployment candidate changes any of:

- `package.json` or `package-lock.json`;
- `.github/workflows/**`;
- `render.yaml`;
- `scripts/production-start.mjs`;
- `scripts/deploy/**`;
- `scripts/db/**`;
- `migrations/**`;
- `shared/schema.ts` or `drizzle.config.ts`;
- `server/auth/**`;
- `.ai/workflows/**` that participate in deployment/release;
- `.ai/skills/**` that participate in deployment/readiness/security/runtime proof;
- `.ai/harness.json`, `.ai/workflow-registry.json`, `.ai/trigger-registry.json`, `.ai/validator-registry.json`, `.ai/artifact-registry.json`, or deployment-related `.ai/schemas/**`;
- `server/ai-harness/**` deployment/readiness/validator contracts;
- environment-variable contracts;
- upload, webhook, admin, or other high-risk production surfaces.

Deployment-control harness files are part of the live-promotion security boundary even when they do not change application runtime bytes.

## Inputs

- exact candidate/base SHAs;
- changed-file list and diff;
- repository security/tooling commands;
- deployment model from `.ai/codebase-map.json` plus authoritative `render.yaml` values;
- existing guardrails and ownership rules.

## Procedure

1. Build an architecture/security delta from changed files only. Read adjacent code when required to prove a finding.
2. If no security-sensitive surface changed, still verify the diff classification, current deployment-control boundaries, and repository security guards, then emit `CLEAR` with an empty findings array when no concrete blocker exists. Do not skip the artifact.
3. For dependency changes:
   - inspect package and lockfile changes;
   - identify newly introduced direct dependencies and scripts;
   - confirm lockfile remains tracked;
   - do not invent CVE claims without a current authoritative source.
4. For CI/CD or deployment-control harness changes:
   - inspect workflow/trigger routing, validator dependencies, authorization boundaries, checkout refs, secret exposure, third-party actions, and production deployment permissions;
   - prove that direct authorization paths cannot bypass security/readiness gates;
   - flag only concrete paths that can affect untrusted or production execution.
5. For environment/deploy changes:
   - inspect variable names and fail-closed behavior without printing values;
   - verify `render.yaml`, startup, health, readiness, and migration semantics remain internally consistent.
6. For auth/admin/high-risk server changes:
   - trace authorization boundaries and data flow around the changed path;
   - do not broaden into a repository-wide pentest unless separately requested.
7. Run the repository's existing security guard commands:
   - `npm run security:node-provenance-guard`
   - `npm run security:node-runtime-guard`
   - `npm run security:axios-guard`
8. Cross-check findings against tests and existing guardrails.
9. Report only findings with a concrete production/deployment consequence.
10. Route any failing security command through `axtask.failure-recovery.v1`.
11. Write `.ai/runs/<run-id>/predeploy-security-review.json` matching `.ai/schemas/predeploy-security-review-result.schema.json`, binding the disposition to the exact candidate SHA and base SHA.
12. Return a release disposition: `CLEAR`, `BLOCKED`, or `NEEDS_OPERATOR_DECISION`.

## Finding contract

Every finding must include:

- file and line/surface;
- severity;
- evidence;
- concrete release or exploit consequence;
- remediation owner;
- whether it blocks deployment.

The machine-readable result also records the candidate SHA, base SHA, disposition, and proof ceiling. Do not report vague missing-best-practice observations as blockers.

## Guardrails

- Read-only review except for separately owned remediation.
- No live API probes, credential validation, secret testing, or production mutation.
- Never print raw environment values or tokens.
- Do not claim vulnerability reachability unless code/config tracing supports it.
- Do not treat documentation prose as runtime behavior.
- A security result is stale when either candidate SHA or base SHA changes.
- Never omit the security result merely because the diff appears low risk; the low-risk result is a current `CLEAR` artifact, not absence of evidence.

## Outputs

- `.ai/runs/<run-id>/predeploy-security-review.json` — required machine-readable disposition for authorization;
- current run operator report and final handoff.

If remediation changes paths or the candidate/base SHA, re-run validator selection and this security review from the new diff.

## Proof ceiling

`repository-security-delta`. This skill can block deployment; it cannot prove production security.
