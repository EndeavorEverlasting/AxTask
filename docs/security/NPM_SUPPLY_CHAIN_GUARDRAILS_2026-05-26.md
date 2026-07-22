# NPM Supply-Chain Guardrails - 2026-05-26

> **Preservation update — 2026-07-22:** Recovered from stale Replit audit PR #64 onto current `main`. This is operational security doctrine, not evidence that a compromise occurred.

Status: active docs-only security doctrine.

This note defines AxTask's baseline posture for npm and developer-tooling supply-chain risk during repository recovery and Replit escape work.

## Core posture

Dependency state is not authority. Git history, scoped diffs, reviewed manifests, and validated audit notes are authority.

Treat `node_modules` as disposable. Treat lockfiles as evidence. Treat npm lifecycle scripts as review targets. Treat Replit branches as contaminated evidence unless proven otherwise.

## Safe install posture

During audit or recovery work, begin with installation modes that disable lifecycle scripts. Inspect package scripts, direct dependencies, lockfile changes, provenance, and audit output before running project setup scripts manually.

AxTask has legitimate postinstall behavior for the billing bridge Python setup. That increases the need for review during quarantine; it does not make lifecycle execution safe by default.

## Branch and commit discipline

Every security branch must include a date and scope, such as `docs/2026-05-26-shai-hulud-foundry-audit`.

Every security-sensitive commit must be narrow and dated, such as `docs(security): add 2026-05-26 npm guardrails summary`.

Vague commits such as `updates`, `security fixes`, or `misc cleanup` are rejected for this workflow.

## PR requirements

Security-sensitive PRs must list the base branch, base SHA, head branch, head SHA, expected changed files, verification commands, non-goals, and STOP conditions.

The PR body must explicitly say whether package manager files, workflows, `.replit`, `replit.nix`, lifecycle scripts, or token-bearing files changed.

## Replit escape rules

Do not merge raw Replit branches. Do not revive stale schema names such as `skillUnlocks`. Do not allow `.replit` or `replit.nix` into unrelated recovery PRs. Use local `subrepl-*` branches only for product-intent discovery and forensic comparison.

## Escalation states

**Green:** docs-only, scoped, dated, no dependency files, no workflow files.

**Yellow:** package files changed, lifecycle scripts touched, CI configuration touched, generated code involved, or provenance cannot be established. Requires a dedicated audit PR.

**Red:** suspected credential exposure, unexplained lockfile churn, unexpected workflow change, or raw Replit merge attempt. Stop feature work and audit access before continuing.

## Hardening candidates

1. Maintain package lifecycle-script contract tests.
2. Maintain a dependency review checklist.
3. Audit CI permissions and third-party actions.
4. Keep Python billing bridge test dependencies reproducible.
5. Add package provenance rules before publishing packages.
