authorityRef: axtask.agent-authority.v1

# Skill: predeploy security review

id: axtask.skill.predeploy-security-review.v1

## Purpose

Run a bounded, deployment-focused security delta review before AxTask production promotion.

This imports only the useful predeploy slice of gstack `/cso`: infrastructure-first inspection, supply-chain awareness, CI/CD scrutiny, secret-handling checks, and evidence-backed findings. It intentionally does not import gstack's broad recurring OWASP/STRIDE program, browser tooling, or unrelated product-audit phases.

## Activation

Use when a deployment candidate changes any of:

- `package.json` or `package-lock.json`;
- `.github/workflows/**`;
- `render.yaml`;
- `scripts/production-start.mjs`;
- `scripts/deploy/**`;
- `scripts/db/**`;
- `migrations/**`;
- `shared/schema.ts` or `drizzle.config.ts`;
- `server/auth/**`;
- environment-variable contracts;
- upload, webhook, admin, or other high-risk production surfaces.

## Inputs

- exact candidate/base SHAs;
- changed-file list and diff;
- repository security/tooling commands;
- deployment model from `.ai/codebase-map.json`;
- existing guardrails and ownership rules.

## Procedure

1. Build an architecture/security delta from changed files only. Read adjacent code when required to prove a finding.
2. For dependency changes:
   - inspect package and lockfile changes;
   - identify newly introduced direct dependencies and scripts;
   - confirm lockfile remains tracked;
   - do not invent CVE claims without a current authoritative source.
3. For CI/CD changes:
   - inspect workflow triggers, checkout refs, secret exposure, third-party actions, and production deployment permissions;
   - flag only concrete paths that can affect untrusted or production execution.
4. For environment/deploy changes:
   - inspect variable names and fail-closed behavior without printing values;
   - verify `render.yaml`, startup, health, readiness, and migration semantics remain internally consistent.
5. For auth/admin/high-risk server changes:
   - trace authorization boundaries and data flow around the changed path;
   - do not broaden into a repository-wide pentest unless separately requested.
6. Run the repository's existing security guard commands when relevant:
   - `npm run security:node-provenance-guard`
   - `npm run security:node-runtime-guard`
   - `npm run security:axios-guard`
7. Cross-check findings against tests and existing guardrails.
8. Report only findings with a concrete production/deployment consequence.
9. Route any failing security command through `axtask.failure-recovery.v1`.
10. Return a release disposition: `CLEAR`, `BLOCKED`, or `NEEDS_OPERATOR_DECISION`.

## Finding contract

Every finding must include:

- file and line/surface;
- severity;
- evidence;
- concrete release or exploit consequence;
- remediation owner;
- whether it blocks deployment;
- proof ceiling.

Do not report vague missing-best-practice observations as blockers.

## Guardrails

- Read-only review except for separately owned remediation.
- No live API probes, credential validation, secret testing, or production mutation.
- Never print raw environment values or tokens.
- Do not claim vulnerability reachability unless code/config tracing supports it.
- Do not treat documentation prose as runtime behavior.

## Outputs

Record the result in the current run's operator report and final handoff. If remediation changes paths, re-run validator selection from the new diff.

## Proof ceiling

Repository/security-delta evidence only. This skill can block deployment; it cannot prove production security.
