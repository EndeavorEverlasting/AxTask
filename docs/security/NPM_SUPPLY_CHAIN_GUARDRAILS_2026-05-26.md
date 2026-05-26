# NPM Supply-Chain Guardrails - 2026-05-26

Status: docs-only security doctrine.

This note defines AxTask's first-pass posture for npm and developer-tooling supply-chain risk during Replit escape work.

## Core posture

Dependency state is not authority. Git history, scoped diffs, and reviewed audit notes are authority.

Treat `node_modules` as disposable. Treat lockfiles as evidence. Treat npm lifecycle scripts as review targets. Treat Replit branches as contaminated evidence unless proven otherwise.

## Safe install posture

During audit or recovery work, use npm install modes that disable lifecycle scripts first. Inspect package scripts, direct dependencies, lockfile changes, and audit output before running project setup scripts manually.

AxTask currently has legitimate postinstall behavior for the billing bridge Python setup. That increases the need for review during quarantine; it does not make lifecycle execution safe by default.

## Branch and commit discipline

Every security branch must include a date and scope, such as `docs/2026-05-26-shai-hulud-foundry-audit`.

Every security-sensitive commit must be narrow and dated, such as `docs(security): add 2026-05-26 npm guardrails summary`.

Vague commits such as `updates`, `security fixes`, or `misc cleanup` are rejected for this workflow.

## PR requirements

Security-sensitive PRs must list the base branch, base SHA, head branch, head SHA, expected changed files, verification commands, non-goals, and STOP conditions.

The PR body must explicitly say whether package manager files, workflows, `.replit`, or `replit.nix` changed.

## Replit escape rules

Do not merge raw Replit branches. Do not port stale schema names such as `skillUnlocks`. Do not allow `.replit` or `replit.nix` into feature recovery PRs. Use local `subrepl-*` branches only for product-intent discovery.

## Escalation states

Green: docs-only, scoped, dated, no dependency files, no workflow files.

Yellow: package files changed, lifecycle scripts touched, CI config touched, generated code involved. Requires dedicated audit PR.

Red: suspected credential exposure, unexplained lockfile churn, unexpected workflow change, or raw Replit merge attempt. Stop feature work and audit access before continuing.

## Next hardening candidates

1. Add a package lifecycle script contract test.
2. Add a dependency review checklist.
3. Add a CI permissions audit note.
4. Add a Python billing bridge test dependency PR.
5. Consider package provenance rules if AxTask ever publishes packages.
